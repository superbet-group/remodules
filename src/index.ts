import {
  type Action,
  type AnyAction,
  combineReducers,
  configureStore,
  type ConfigureStoreOptions,
  createAction,
  createSelector,
  createSlice,
  type CreateSliceOptions,
  type EnhancedStore,
  type Middleware,
  type Reducer,
  type Slice,
  type SliceCaseReducers,
  type Store,
} from "@reduxjs/toolkit";
import { type ThunkMiddlewareFor } from "@reduxjs/toolkit/dist/getDefaultMiddleware";
import { useEffect, useRef, useState } from "react";
import { useStore } from "react-redux";
import createSagaMiddleware, { type Task } from "redux-saga";

export type SelectorsShape<State> = { [key: string]: (state: State) => any };

export type ModuleConfig<
  State,
  CaseReducers extends SliceCaseReducers<State>,
  Selectors extends SelectorsShape<State>,
  Name extends string = string
  > = {
    selectors?: Selectors;
  } & CreateSliceOptions<State, CaseReducers, Name>;

type FinalSelectors<
  State = any,
  Name extends string = string,
  Selectors extends SelectorsShape<State> = {}
  > = {
    [key in keyof Selectors]: (state: { [key in Name]: State }) => ReturnType<
      Selectors[key]
    >;
  };

export type Module<
  State = any,
  CaseReducers extends SliceCaseReducers<State> = SliceCaseReducers<State>,
  Selectors extends SelectorsShape<State> = {},
  Name extends string = string,
  ModuleSlice = Slice<State, CaseReducers, Name> & { selectors: FinalSelectors<State, Name, Selectors>; }
  > = ModuleSlice & {
    withWatcher<Watcher extends () => Generator>(createWatcher: (action: ModuleSlice) => Watcher): ModuleWithWatcher<
      State,
      CaseReducers,
      Selectors,
      Watcher,
      Name>;
  };

export type ModuleWithWatcher<
  State = any,
  CaseReducers extends SliceCaseReducers<State> = SliceCaseReducers<State>,
  Selectors extends SelectorsShape<State> = {},
  Watcher extends () => Generator = () => Generator,
  Name extends string = string
  > = Module<State, CaseReducers, Selectors, Name> & {
    watcher?: Watcher;
  }

export const createModule = <
  State,
  CaseReducers extends SliceCaseReducers<State>,
  Selectors extends SelectorsShape<State>,
  Name extends string = string
>(
  config: ModuleConfig<State, CaseReducers, Selectors, Name>
): Module<State, CaseReducers, Selectors, Name> => {
  const { selectors: sliceSelectors, ...sliceConfig } = config;

  const slice = createSlice(sliceConfig);
  const rootSelector = (state: { [key in Name]: State }) => {
    return state[slice.name];
  };

  const selectors = Object.entries(sliceSelectors).reduce(
    (acc, [key, selector]) => ({
      ...acc,
      [key]: createSelector(rootSelector, selector),
    }),
    {} as FinalSelectors<State, Name, Selectors>
  );

  const moduleSlice = { ...slice, selectors };

  return {
    ...moduleSlice,
    withWatcher(createWatcher) {
      const watcher = createWatcher(moduleSlice);
      return { ...this, watcher };
    }
  };
};

export type DynamicStore<
  State = any,
  ActionType extends Action<any> = AnyAction,
  MiddlewareType extends ReadonlyArray<Middleware<{}, State>> = [
    ThunkMiddlewareFor<State>
  ]
  > = EnhancedStore<State, ActionType, MiddlewareType> & {
    addModule: (module: ModuleWithWatcher) => void;
    removeModule: (module: ModuleWithWatcher) => void;
  };

const isObject = (candidate: unknown): candidate is object => {
  return typeof candidate === "object" && candidate !== null;
};

type CreateDynamicStoreOptions<
  State = any,
  ActionType extends Action<any> = AnyAction,
  MiddlewareType extends ReadonlyArray<Middleware<{}, State>> = [
    ThunkMiddlewareFor<State>
  ]
  > = { rootSaga?: () => Generator } & ConfigureStoreOptions<
    State,
    ActionType,
    MiddlewareType
  >;

export const moduleAdded = createAction<string>("@@MODULE/ADDED");
export const moduleRemoved = createAction<string>("@@MODULE/REMOVED");

const baseReducer = (state: any, action: AnyAction) => {
  switch (action.type) {
    case moduleRemoved.type:
      const { payload: moduleName } = action;
      const { [moduleName]: removedModule, ...rest } = state;
      return rest;
    default:
      return state;
  }
};

export const createDynamicStore = <
  State = any,
  ActionType extends Action<any> = AnyAction,
  MiddlewareType extends ReadonlyArray<Middleware<{}, State>> = [
    ThunkMiddlewareFor<State>
  ]
>({
  reducer,
  rootSaga,
  middleware,
  ...options
}: CreateDynamicStoreOptions<State, ActionType, MiddlewareType>): DynamicStore<
  State,
  ActionType,
  MiddlewareType
> => {
  let originalReducer: Reducer<State, ActionType>;

  if (typeof reducer === "function") {
    originalReducer = reducer;
  } else if (isObject(reducer)) {
    originalReducer = combineReducers(reducer);
  } else {
    throw new Error(
      '"reducer" is a required argument, and must be a function or an object of functions that can be passed to combineReducers'
    );
  }

  const sagaMiddleware = createSagaMiddleware();

  const originalReducerWithBase = (state: State, action: ActionType) => {
    return baseReducer(originalReducer(state, action), action);
  };

  const store = configureStore<State, ActionType, MiddlewareType>({
    reducer: originalReducerWithBase,
    middleware: (getDefaultMiddleware) => {
      let modifiedMiddleware = [] as unknown as MiddlewareType;
      if (typeof middleware === "function") {
        modifiedMiddleware = middleware(getDefaultMiddleware);
      } else if (Array.isArray(middleware)) {
        modifiedMiddleware = middleware;
      }
      return [
        sagaMiddleware,
        ...modifiedMiddleware,
      ] as unknown as MiddlewareType;
    },
    ...options,
  });

  if (rootSaga) {
    sagaMiddleware.run(rootSaga);
  }

  const updateReducer = () => {
    if (moduleCount.size === 0) {
      store.replaceReducer(originalReducerWithBase);
      return;
    }
    const moduleReducers = {};
    for (const { name, reducer } of moduleCount.keys()) {
      moduleReducers[name] = reducer;
    }
    const newModuleReducer = combineReducers(
      moduleReducers
    ) as unknown as Reducer<State>;
    const combinedReducer = (state, action) => {
      return originalReducerWithBase(newModuleReducer(state, action), action);
    };
    store.replaceReducer(combinedReducer);
  };

  const moduleCount = new Map<ModuleWithWatcher, number>();

  const sagaToTask = new Map<() => Generator, Task>();

  const addSaga = (saga: () => Generator) => {
    let task = sagaToTask.get(saga);
    if (task) {
      return;
    }
    task = sagaMiddleware.run(saga);
    sagaToTask.set(saga, task);
  };

  const removeSaga = (saga: () => Generator) => {
    const task = sagaToTask.get(saga);
    if (!task) {
      return;
    }
    task.cancel();
    sagaToTask.delete(saga);
  };

  const addModule = (newModule: ModuleWithWatcher) => {
    const count = moduleCount.get(newModule);
    if (count !== undefined) {
      moduleCount.set(newModule, count + 1);
      return;
    }
    moduleCount.set(newModule, 1);
    if (newModule.watcher) {
      addSaga(newModule.watcher);
    }
    updateReducer();
    store.dispatch(moduleAdded(newModule.name) as any);
  };

  const removeModule = (oldModule: ModuleWithWatcher) => {
    const count = moduleCount.get(oldModule);
    if (count !== 1) {
      moduleCount.set(oldModule, count - 1);
      return;
    }
    store.dispatch(moduleRemoved(oldModule.name) as any);
    moduleCount.delete(oldModule);
    if (oldModule.watcher) {
      removeSaga(oldModule.watcher);
    }
    updateReducer();
  };

  const dynamicStore: DynamicStore<State, ActionType, MiddlewareType> =
    store as unknown as DynamicStore<State, ActionType, MiddlewareType>;

  dynamicStore.addModule = addModule;
  dynamicStore.removeModule = removeModule;

  return dynamicStore;
};

const isDynamicStore = (store: Store): store is DynamicStore => {
  return (
    typeof (store as unknown as DynamicStore).addModule === "function" &&
    typeof (store as unknown as DynamicStore).removeModule === "function"
  );
};

const useDynamicStore = () => {
  const store = useStore();

  if (!isDynamicStore(store)) {
    throw new Error(
      "Expected dynamic store to be in context. Did you forget to replace `createStore` with `createDynamicStore`?"
    );
  }

  return store;
};

export const useModule = (dynamicModule: ModuleWithWatcher) => {
  if (!dynamicModule) {
    throw new Error(
      "Expected parameter `dynamicModule` of `useModule` to be provided"
    );
  }
  const store = useDynamicStore();
  const previousModule = useRef<ModuleWithWatcher>(dynamicModule);

  const { addModule, removeModule } = store;

  // We avoid using `useEffect` on purpose as we need the module to be available directly on mount
  // so that `useSelector` can be used without needing to worry about `undefined` states
  useState(() => {
    addModule(dynamicModule);
  });

  // Handle the case when for some reason the `dynamicModule` parameter gets updated
  if (dynamicModule !== previousModule.current) {
    removeModule(previousModule.current);
    addModule(dynamicModule);
    previousModule.current = dynamicModule;
  }

  useEffect(() => {
    return () => {
      removeModule(dynamicModule);
    };
  }, []);
};
