# `@superbet-group/shared.redux-dynamic-modules` - dynamic module loading for your Redux application

## Installation

```bash
npm install --save @superbet-group/shared.redux-dynamic-modules
```

## Add Peer Dependencies

```bash
npm install --save @reduxjs/toolkit redux-saga # react redux react-redux
```

## Usage

```tsx
import { applyMiddleware } from "redux";
import {
  createDynamicStore,
  createModule,
  useModule,
} from "@superbet-group/shared.redux-dynamic-modules";
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
