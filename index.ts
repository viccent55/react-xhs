import { AppRegistry } from 'react-native';
import App from './App';
import { debugStorage, clearAllStorage } from './hooks/useDebugStorage';
import { name as appName } from './app.json';
import { initApiHostsInternal } from './services/apiHostInit';
// clearAllStorage();
// debugStorage();
// 🚀 START API HOST RESOLUTION ON APP BOOT
initApiHostsInternal().catch(() => {
  // optional: avoid unhandled promise warning
});

AppRegistry.registerComponent(appName, () => App);
