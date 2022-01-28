![remodules logo](/logo.svg "a red lightning with 2 atoms chasing each other around it")

# `remodules` - Dynamic Module Loading for Your Redux Application

## Installation

```bash
npm install --save remodules
```

## Add Peer Dependencies

```bash
npm install --save @reduxjs/toolkit redux-saga # react redux react-redux
```

## Usage

```tsx
import { createDynamicStore, createModule, useModule } from "remodules";
import { Provider, useDispatch } from "react-redux";

const counterModule = createModule({
  name: "counter",
  initialState: {
    count: 0,
  },
  actions: {
    increment: (state, payload) => ({
      ...state,
      count: state.count + payload,
    }),
    decrement: (state, payload) => ({
      ...state,
      count: state.count - payload,
    }),
  },
  selectors: {
    count: (state) => state.count,
  },
});

const store = createDynamicStore({
  reducer: {},
});

const Counter = () => {
  useModule(counterModule);

  const count = useSelector(counterModule.selectors.count);

  const dispatch = useDispatch();

  const onIncrement = () => dispatch(counterModule.actions.increment(1));
  const onDecrement = () => dispatch(counterModule.actions.decrement(1));

  return (
    <div>
      <p>count is: {count}</p>
      <button onClick={onIncrement}>Increment</button>
      <button onClick={onDecrement}>Decrement</button>
    </div>
  );
};

const App = () => {
  return (
    <Provider store={store}>
      <Counter />
    </Provider>
  );
};
```

## Usage with Redux-Saga

By convention, Sagas are named _"watchers"_ as they keep running for the lifecycle of the module (unless interrupted from within themselves).

You can attach a watcher to the module by using the `withWatcher` method on the store.

> NOTE: this returns a copy of the old module, with the watcher attached instead of it being applied to the original module.

`withWatcher` accepts a function with a single argument which is the `module` created by `createModule` (with the exception of `withWatcher` method itself) and should return a generator function, which will run as the watcher.

```ts
const counterModule = createModule({
  name: "counter",
  initialState: {
    count: 0,
  },
  actions: {
    increment: (state, payload) => ({
      ...state,
      count: state.count + payload,
    }),
    decrement: (state, payload) => ({
      ...state,
      count: state.count - payload,
    }),
    boom: () => {},
  },
  selectors: {
    count: (state) => state.count,
  },
}).withWatcher(({ actions, selectors }) => {
  return function* watcher() {
    while (true) {
      yield take(actions.boom);
      const count = yield select(selectors.count);
      yield put(actions.increment(Math.floor(Math.random() * count)));
    }
  };
});
```

## When the Module is Removed

Before the module gets removed from the store, you have a chance to perform cleanup via the watcher. You can technically also handle cleanup in the `extraReducers` of the module, but the resulting state will never be rendered and side-effects are discouraged from reducers.

```ts
import { createModule, moduleRemoved } from "remodules";

const explodeOnUnmountModule = createModule({
  name: "explodeOnUnmount",
  initialState: {
    count: 0,
  },
  actions: {
    increment: (state, payload) => ({
      ...state,
      count: state.count + payload,
    }),
    decrement: (state, payload) => ({
      ...state,
      count: state.count - payload,
    }),
  },
  selectors: {
    count: (state) => state.count,
  },
}).withWatcher(({ actions }) => {
  return function* watcher() {
    while (true) {
      yield take(
        (action) =>
          moduleRemoved.match(action) && action.payload === "explodeOnUnmount"
      );
      yield call(triggerExplosion);
    }
  };
});
```

> NOTE: your saga task will be cancelled right after this, synchronously.

## Motivation

There are numerous use cases for dynamic module loading in Redux applications. For example:

You may want to keep bundle size smaller and asynchronously load modules as needed, in case:

- User lands on specific page
- User uses a specific device
- User has a specific browser
- Additional features are enabled, such as experimental or conditional features

You may not have all of the reducers and sagas available at start time, because:

- You're developing microfrontends, but want to use the same global store for all states
- Some of your application might be using a different framework (React, Vue, Angular, etc) yet you want to use the same Redux store for all of them
