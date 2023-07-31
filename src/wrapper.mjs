// avoid the dual package hazard (not a big risk for this package, but maybe could be with caching?)
// https://nodejs.org/api/packages.html#dual-commonjses-module-packages
// this issue was useful: https://github.com/apollographql/apollo-server/issues/7625
import Pkg from './index'

// codegen:start {preset: barrel}
// codegen:end
