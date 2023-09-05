import {call, fork, put, takeLatest, delay} from "redux-saga/effects";

let _store;
let _settings = {
  debug: false,
  resetTimeout: 100,
  defaultWatcherType: takeLatest,
};

String.prototype.actionSuffix = function (suffix) {
  return this + "_" + suffix;
};

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const flatten = function (arr, result = []) {
  for (let i = 0, length = arr.length; i < length; i++) {
    const value = arr[i];
    if (Array.isArray(value)) {
      flatten(value, result);
    } else {
      result.push(value);
    }
  }
  return result;
};

export const GEN_STATUS = {
  INITIAL: "INITIAL",
  LOADING: "LOADING",
  RETRYING: "RETRYING",
  SUCCESS: "SUCCESS",
  FAIL: "FAIL",
};

export const ACTION_TYPES = {
  TRIGGER: "TRIGGER",
  SUCCESS: "SUCCESS",
  RETRY: "RETRY",
  FAIL: "FAIL",
  RESET: "RESET",
};

const INIT_STATE = {
  error: undefined,
  data: undefined,
  isNotTriggeredAtLeastOnce: undefined,
  retryAttempt: undefined,
  status: GEN_STATUS.INITIAL,
};

export const setStore = (store) => {
  _store = store;
};

export const setSettings = (settings) => {
  _settings = settings;
};

export const getReducers = (...unmerged) => {
  const gens = [];
  flatten(unmerged, gens);
  const reducers = {};
  for (const gen of gens) {
    const reducer = genReducer(gen.action);
    reducers[gen.action] = reducer;
  }
  return reducers;
};

export const getSagasFork = (...unmerged) => {
  const result = [];
  const gens = [];
  flatten(unmerged, gens);
  for (const gen of gens) {
    const s = genSagaWatcher(gen.action, gen.worker, gen.opts);
    result.push(fork(s));
  }
  return result;
};

export const on = (actionType) => {
  if (!_store) {
    throw new Error("You need to set the store");
  }
  return {
    trigger: (payload) => {
      _store.dispatch({
        type: actionType.actionSuffix(ACTION_TYPES.TRIGGER),
        payload: payload,
      });
    },
    reset: (timeout = _settings.resetTimeout) => {
      // This timeout is so subscribers of the isSuccess event have time to act
      setTimeout(() => {
        _store.dispatch({type: actionType.actionSuffix(ACTION_TYPES.RESET)});
      }, timeout);
    },
    status: () => {
      return _store.getState()[actionType].status;
    },
    error: () => {
      return _store.getState()[actionType].error;
    },
    data: () => {
      return _store.getState()[actionType].data;
    },
    retryAttempt: () => {
      return _store.getState()[actionType].retryAttempt;
    },
    isNotTriggeredAtLeastOnce: () => {
      return (
        _store.getState()[actionType].isNotTriggeredAtLeastOnce === undefined
      );
    },
    isLoading: _store.getState()[actionType].status === GEN_STATUS.LOADING,
    isSuccess: _store.getState()[actionType].status === GEN_STATUS.SUCCESS,
    isRetrying: _store.getState()[actionType].status === GEN_STATUS.RETRYING,
    isFail: _store.getState()[actionType].status === GEN_STATUS.FAIL,
  };
};

const getFixedActions = (actionType) => {
  return {
    TRIGGER: actionType.actionSuffix(ACTION_TYPES.TRIGGER),
    SUCCESS: actionType.actionSuffix(ACTION_TYPES.SUCCESS),
    RETRY: actionType.actionSuffix(ACTION_TYPES.RETRY),
    FAIL: actionType.actionSuffix(ACTION_TYPES.FAIL),
    RESET: actionType.actionSuffix(ACTION_TYPES.RESET),
  };
};

const RETRY_DEFAULT = {
  every: 1000,
  times: 0,
  max: 60000,
  exponential: true,
  jitter: true,
};

const genSagaWatcher = (
  actionType,
  workerFn,
  {
    pollEvery = undefined,
    retry = {},
    typeOfWatcher = _settings.defaultWatcherType,
  } = {},
) => {
  const retryOpts = {
    ...RETRY_DEFAULT,
    ...retry,
  };
  const ACTIONS = getFixedActions(actionType);

  const sagaFn = function* (action) {
    let attempt = 0;
    while (attempt++ <= retryOpts.times) {
      try {
        const response = yield call(workerFn(action.payload));
        yield put({type: ACTIONS.SUCCESS, payload: response});
        break;
      } catch (error) {
        if (_settings.debug) {
          console.log("error:", error);
          console.log("attempt", attempt);
          console.log("retryOpts", retryOpts);
        }
        if (attempt > retryOpts.times) {
          yield put({type: ACTIONS.FAIL, error: error});
        } else {
          yield put({type: ACTIONS.RETRY, retryAttempt: attempt});
          let retryDelay = retryOpts.every;
          if (retryOpts.exponential) {
            retryDelay = Math.min(
              retryOpts.max,
              retryOpts.every * 2 ** attempt,
            );
          }
          if (retryOpts.jitter) {
            retryDelay = getRandomIntInclusive(0, retryDelay);
          }
          if (_settings.debug) {
            console.log("waiting for:", retryDelay);
          }
          yield delay(retryDelay);
        }
      }
    }
  };

  const sagaLoop = function* (action) {
    while (true) {
      yield sagaFn(action);
      yield delay(pollEvery);
    }
  };

  return function* () {
    if (pollEvery) {
      yield typeOfWatcher(ACTIONS.TRIGGER, sagaLoop);
    } else {
      yield typeOfWatcher(ACTIONS.TRIGGER, sagaFn);
    }
  };
};
const genReducer = (actionType) => {
  const ACTIONS = getFixedActions(actionType);
  return (state = INIT_STATE, action) => {
    switch (action.type) {
      case ACTIONS.TRIGGER:
        return {
          ...state,
          status: GEN_STATUS.LOADING,
          isNotTriggeredAtLeastOnce:
            state.isNotTriggeredAtLeastOnce === undefined,
          error: undefined,
        };

      case ACTIONS.RETRY:
        return {
          ...state,
          retryAttempt: action.retryAttempt,
          status: GEN_STATUS.RETRYING,
        };

      case ACTIONS.SUCCESS:
        return {
          ...state,
          data: action.payload,
          status: GEN_STATUS.SUCCESS,
        };

      case ACTIONS.FAIL:
        return {
          ...state,
          status: GEN_STATUS.FAIL,
          error: action.error,
        };
      case ACTIONS.RESET:
        return {
          ...state,
          error: undefined,
          retryAttempt: undefined,
          status: GEN_STATUS.INITIAL,
        };

      default:
        return state;
    }
  };
};
