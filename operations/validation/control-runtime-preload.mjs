import { assertExactOperationsControlRuntime } from './control-runtime.mjs';

assertExactOperationsControlRuntime({
  expectedLifecycleEvent: process.env.npm_lifecycle_event,
});
