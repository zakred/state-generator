# Sate Generator

This module is released in npm as `state-generator`. Generate over a hundred lines of code with one line, generate all your actions, reducers, sagas and different types of states along with utilities.

## Install

```
npm install --save state-generator
```

```
yarn add state-generator
```

## Dependencies

#### Required Peer Dependencies

These libraries are not bundled with state-generator and required at runtime:

- redux
- redux-saga

## Getting Started

Check out the demo app https://github.com/zakred/demo-app-state-generator

## Usage

### Quick Start

This lib is intended for applications using redux sagas, let's suppose you have your store configuration in a folder `src/store`, and you create your files for actions, reducers, sagas in `src/store/feature`. You can make use of this lib and leave all your previous structure and code in place.

- Place your code in a new type of file called gen.js (gen from generated), in this example we will create an action/event that will fetch users from github

src/store/github-users/gen.js

```js
export default [
  // This one line of code will generate all the state functionality that we will subsequently use
  { action: "GET_GITHUB_USERS", worker: () => () => fetch("https://api.github.com/users").then((res) => res.json()) }
]
```

- Now use it in your component

src/page/github-page/index.js

```js
import {on} from 'state-generator';

const GithubPage = () => {
    
  const onGetGithubUsers = on('GET_GITHUB_USERS');

  return (
    <div>
      <Button onClick={() => onGetGithubUsers.trigger()}>Trigger</Button>
      {onGetGithubUsers.isLoading && <span>Loading...</span>}
      {onGetGithubUsers.isFail && <span>Error... {JSON.stringify(onGetGithubUsers.error())}</span>}
      {onGetGithubUsers.isSuccess && onGetGithubUsers.data().map((user, index) => (
        <div key={index}>
            username: {user.login}
        </div>
      ))}
    </div>
  )
}
```

### "on" States

| Property                    | Description                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| isLoading                   | State when action is loading                                         |
| isSuccess                   | State when action was successful                                     |
| isRetrying                  | State when retry is configured and action is retrying due to failure |
| isFail                      | State when action failed                                             |
| isNotTriggeredAtLeastOnce() | State when action has never been triggered                           |

### "on" Functionality

| Property     | Arguments         | Description                                                                                      |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------ |
| trigger      | payload(optional) | Start/Run the worker                                                                             |
| reset        | timeout(optional) | Reset the event status, optionally can be passed a time in milliseconds to wait before resetting |
| status       |                   | Return the current status                                                                        |
| error        |                   | Error object returned from worker                                                                |
| data         |                   | Data returned from worker                                                                        |
| retryAttempt |                   | If retry is set, this will give the number of retry attempt                                      |

### Configuration

You need to set your gen files to your store, to do this configure the reducer and saga.

src/reducers

```js
import feature1Gen from "./feature1/gen";
import feature2Gen from "./feature2/gen";

const rootReducer = combineReducers({
  ...getReducers(feature1Gen, feature2Gen),
});

export default rootReducer;
```

src/sagas

```js
import feature1Gen from "./feature1/gen";
import feature2Gen from "./feature2/gen";

export default function* rootSaga() {
  yield all([...getSagasFork(feature1Gen, feature2Gen)]);
}
```

src/store

```js
import {createStore, applyMiddleware, compose} from "redux";
import createSagaMiddleware from "redux-saga";
import rootReducer from "./reducers";
import rootSaga from "./sagas";
import {setStore} from "state-generator";

const sagaMiddleware = createSagaMiddleware();
const store = createStore(
  rootReducer,
  compose(applyMiddleware(sagaMiddleware)),
);
sagaMiddleware.run(rootSaga);

// This is the relevant line of this example
setStore(store);

export default store;
```

### IMPORTANT

Notice the double arrow in the worker. `() => () =>`

src/store/feature/gen.js

```js
const myWorker = (payload) => () => {
  // my code
};
```

This is equivalent to:

```js
function myWorker(payload) {
  return function () {
    // my code
  };
}
```

### Payloads

To pass data to your worker simply add to your worker the parameter

src/store/feature/gen.js

```js

const myWorker = (payload) => () => {
  return post(payload);
};

export default [
  {action: 'MY_ACTION', worker: myWorker}}
]
```

src/page/mypage/index.js

```js
import {on} from "state-generator";

const Component = () => {
  const payload = {id: 1, name: "my payload"};
  on("MY_ACTION").trigger(payload);
};
```

### Async function

You can make your worker async

src/store/feature/gen.js

```js

const myAsyncWorker = () => async () => {
  let result = 0;
  result += await asyncOperation();
  result += await asyncOperation();
  return result;
};

export default [
  {action: 'MY_ACTION', worker: myAsyncWorker}}
]
```

### Polling

To poll every X time, pass the `pollEvery` with the value being milliseconds as the interval

- This example polls every 5 seconds

src/store/feature/gen.js

```js
export default [
  {action: 'MY_ACTION', worker: myWorker, opts: {pollEvery: 5000}}}
]
```

### Retry

To retry X times, pass the `retry` object with the value of times you want to retry

- Retry for 5 times

src/store/feature/gen.js

```js
export default [
  {action: 'MY_ACTION', worker: myWorker, opts: {retry: {times: 5}}}}
]
```

#### Retry object

| Property    | Default | Description                                                                       |
| ----------- | ------- | --------------------------------------------------------------------------------- |
| every       | 1000    | Interval to wait before retrying                                                  |
| times       | 0       | How many times to retry                                                           |
| max         | 60000   | Maximum time allowed in milliseconds to wait for a retry                          |
| exponential | true    | Every time it retries the time to wait between will be incremented exponentially  |
| jitter      | true    | Makes the retry random given the max value, retry attempt and exponential setting |

## License

MIT
