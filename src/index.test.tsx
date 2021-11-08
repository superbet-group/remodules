import * as React from "react";
import { useReducer } from "react";
import { createStore, PayloadAction } from "@reduxjs/toolkit";
import { Provider, useSelector } from "react-redux";
import { put, take } from "redux-saga/effects";
import { fireEvent, render } from "@testing-library/react";

import { createDynamicStore, createModule, useModule } from ".";

const testModule = createModule({
  name: "test",
  initialState: {
    value: 0,
  },
  reducers: {
    boom: () => {},
    increment: (state) => {
      state.value += 1;
    },
  },
  *watcher() {
    while (true) {
      yield take(testModule.actions.boom.type);
      yield put(testModule.actions.increment());
    }
  },
  selectors: {
    value: (state) => state.value,
    valueTimes10: (state) => state.value * 10,
  },
});

testModule.actions.increment();

testModule.selectors.valueTimes10({ test: { value: 1 } });

type Weather = {
  temperature: number;
  humidity: number;
  wind: number;
  rain: number;
};

const anotherTestModule = createModule({
  name: "anotherTest",
  initialState: {
    loading: false,
    temperature: 0,
    humidity: 0,
    wind: 0,
    rain: 0,
  },
  reducers: {
    loadData: (state) => {
      state.loading = true;
    },
    dataLoaded: (state, action: PayloadAction<Weather>) => {
      state.loading = false;
      state.temperature = action.payload.temperature;
      state.humidity = action.payload.humidity;
      state.wind = action.payload.wind;
      state.rain = action.payload.rain;
    },
  },
  extraReducers: {
    [testModule.actions.increment.type]: (state) => {
      state.temperature += 1;
    },
  },
  *watcher() {
    while (true) {
      yield take(anotherTestModule.actions.loadData.type);
      yield put(
        anotherTestModule.actions.dataLoaded({
          temperature: 1,
          humidity: 2,
          wind: 3,
          rain: 4,
        })
      );
    }
  },
  selectors: {
    temperature: (state) => state.temperature,
    humidity: (state) => state.humidity,
    wind: (state) => state.wind,
    rain: (state) => state.rain,
  },
});

const TestComponent = () => {
  useModule(testModule);

  const value = useSelector(testModule.selectors.value);
  const valueTimes10 = useSelector(testModule.selectors.valueTimes10);

  return (
    <div>
      Test: {value}, {valueTimes10}
    </div>
  );
};

const AnotherTestComponent = () => {
  useModule(anotherTestModule);

  const temperature = useSelector(anotherTestModule.selectors.temperature);
  const humidity = useSelector(anotherTestModule.selectors.humidity);
  const wind = useSelector(anotherTestModule.selectors.wind);
  const rain = useSelector(anotherTestModule.selectors.rain);

  return (
    <div>
      AnotherTest: {temperature}, {humidity}, {wind}, {rain}
    </div>
  );
};

const StoreKeys = () => {
  const keys = useSelector((state) => Object.keys(state));

  return <div data-testid="storeKeys">{keys.join(", ")}</div>;
};

describe("redux dynamic modules", () => {
  it("should be able to initialise modules", () => {
    const store = createDynamicStore({
      reducer: (state = {}) => state,
    });

    const TestApp = () => {
      return (
        <Provider store={store}>
          <TestComponent />
          <AnotherTestComponent />
        </Provider>
      );
    };

    const { getByText } = render(<TestApp />);

    expect(getByText("Test: 0, 0")).toBeTruthy();
    expect(getByText("AnotherTest: 0, 0, 0, 0")).toBeTruthy();
  });

  it("should be able to initialise modules on demand", () => {
    const store = createDynamicStore({
      reducer: (state = {}) => state,
    });

    const TestApp = () => {
      const [mounted, mount] = useReducer(() => true, false);

      return (
        <Provider store={store}>
          {mounted && <TestComponent />}
          <button data-testid="mount" onClick={mount}>
            Mount
          </button>
        </Provider>
      );
    };

    const { getByTestId } = render(<TestApp />);

    const mountButton = getByTestId("mount");

    expect(store.getState().test).toBeUndefined();

    fireEvent.click(mountButton);

    expect(store.getState().test).toBeDefined();
  });

  it("should be able to remove the module when initialising component unmounts", () => {
    const store = createDynamicStore({
      reducer: (state = {}) => state,
    });

    const TestApp = () => {
      const [mounted, mount] = useReducer(() => false, true);

      return (
        <Provider store={store}>
          {mounted && <TestComponent />}
          <button data-testid="unmount" onClick={mount}>
            Unmount
          </button>
        </Provider>
      );
    };

    const { getByTestId } = render(<TestApp />);

    const unmountButton = getByTestId("unmount");

    expect(store.getState().test).toBeDefined();

    fireEvent.click(unmountButton);

    expect(store.getState().test).toBeUndefined();
  });

  it("useMount should be able to handle when a different module is passed as argument", () => {
    const store = createDynamicStore({
      reducer: (state = {}) => state,
    });

    const modules = [testModule, anotherTestModule];

    const TestComponent = () => {
      const [moduleIndex, toggle] = useReducer((state) => Number(!state), 0);

      useModule(modules[moduleIndex]);

      return (
        <div>
          <button data-testid="toggle" onClick={toggle}>
            Toggle
          </button>
        </div>
      );
    };

    const TestApp = () => {
      return (
        <Provider store={store}>
          <TestComponent />
        </Provider>
      );
    };

    const { getByTestId } = render(<TestApp />);

    const toggleButton = getByTestId("toggle");

    expect(store.getState().test).toBeDefined();
    expect(store.getState().anotherTest).toBeUndefined();

    fireEvent.click(toggleButton);

    expect(store.getState().test).toBeUndefined();
    expect(store.getState().anotherTest).toBeDefined();
  });

  it("createDynamicStore should accept an object as the reducer config option", () => {
    const store = createDynamicStore({
      reducer: {
        hello: (state = "hello") => state,
        world: (state = "world") => state,
      },
    });

    const TestApp = () => {
      return (
        <Provider store={store}>
          <StoreKeys />
        </Provider>
      );
    };

    const { getByTestId } = render(<TestApp />);

    expect(getByTestId("storeKeys").innerHTML).toBe("hello, world");
  });

  it("createDynamicStore throws an error if reducer config option is not valid", () => {
    expect(() =>
      createDynamicStore({
        reducer: false,
      })
    ).toThrowError(
      '"reducer" is a required argument, and must be a function or an object of functions that can be passed to combineReducers'
    );
  });

  it("createDynamicStore allows you to override middleware", () => {
    const capture = jest.fn();
    const jestMiddleware = () => (next) => (action) => {
      capture(action);
      return next(action);
    };

    const store = createDynamicStore({
      reducer: {
        hello: (state = "hello") => state,
        world: (state = "world") => state,
      },
      middleware: [jestMiddleware],
    });

    const testAction = { type: "test" };

    store.dispatch(testAction);

    expect(capture).toHaveBeenCalledWith(testAction);
  });

  it("createDynamicStore allows you to add extra middleware", () => {
    const capture = jest.fn();
    const jestMiddleware = () => (next) => (action) => {
      capture(action);
      return next(action);
    };

    const store = createDynamicStore({
      reducer: {
        hello: (state = "hello") => state,
        world: (state = "world") => state,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(jestMiddleware),
    });

    const testAction = { type: "test" };

    store.dispatch(testAction);

    expect(capture).toHaveBeenCalledWith(testAction);
  });

  it("createDynamicStore runs rootSaga when provided", () => {
    const capture = jest.fn();
    function* rootSaga() {
      capture();
    }

    createDynamicStore({
      reducer: {
        hello: (state = "hello") => state,
        world: (state = "world") => state,
      },
      rootSaga,
    });

    expect(capture).toHaveBeenCalled();
  });

  describe("exports useModule hook that", () => {
    it("throws an error if no dynamic store is found", () => {
      const store = createStore((state) => state);

      const TestApp = () => {
        return (
          <Provider store={store}>
            <TestComponent />
          </Provider>
        );
      };

      expect(() => render(<TestApp />)).toThrowError(
        "Expected dynamic store to be in context. Did you forget to replace `createStore` with `createDynamicStore`?"
      );
    });

    it("throws an error if provided argument isn't provided", () => {
      const store = createDynamicStore({
        reducer: (state = {}) => state,
      });

      const NonDynamicComponent = () => {
        // @ts-expect-error
        useModule();

        return null;
      };

      const TestApp = () => {
        return (
          <Provider store={store}>
            <NonDynamicComponent />
          </Provider>
        );
      };

      expect(() => render(<TestApp />)).toThrowError(
        "Expected parameter `dynamicModule` of `useModule` to be provided"
      );
    });
  });
});
