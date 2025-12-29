// hooks/useApiHost.ts
import { initApiHostsInternal } from '../services/apiHostInit';

export default function useApiHosts() {
  return {
    initApiHosts: initApiHostsInternal,
  };
}
