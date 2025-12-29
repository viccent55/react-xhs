/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect, useState } from 'react';
import DialogBase64Ads from './components/DialogBase64Ads';
import StartupLoadingScreen from './components/StartupLoadingScreen';
import HostResolverDialog from './components/HostResolverDialog';
import StartupErrorScreen from './components/StartScreen/StartupErrorScreen';
import StartupSuccessScreen from './components/StartScreen/StartupSuccessScreen';

import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  NativeModules,
} from 'react-native';
import RNBootSplash from 'react-native-bootsplash';

import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useStore } from './store';
import { loading, failedHosts, failedClouds } from './services/apiHostInit';
import { useReport } from './hooks/useReport';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [channel, setChannel] = useState<string>('loading...');
  const [showAds, setShowAds] = useState(false);
  const [showResolverDialog, setShowResolverDialog] = useState(true);
  const { runOncePerDay, getFirstVisitInApp } = useReport();
  /* ----------------------------
   * Stores & hooks
   * ---------------------------- */
  const store = useStore();
  // ✅ HIDE SPLASH HERE (IMPORTANT)
  useEffect(() => {
    RNBootSplash.hide({ fade: true });
  }, []);

  // ✅ Show Channel
  useEffect(() => {
    async function loadChannel() {
      try {
        const ch = await NativeModules.Channel.getChannel();
        setChannel(ch);
      } catch {
        setChannel('error');
      }
    }
    loadChannel();

    if (channel) {
      runOncePerDay(channel);
      getFirstVisitInApp();
    }
  }, []);

  /* =================================================
   * 2️⃣ AUTO-SHOW ADS (THIS WAS THE MISSING PIECE)
   * ================================================= */
  useEffect(() => {
    if (store.ads.base64) {
      setShowAds(true);
    }
  }, [store.ads.base64]);

  const hasHost = !!store.urlEndPoint;
  const allFailed =
    !hasHost && (failedHosts.length > 0 || failedClouds.length > 0);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={!isDarkMode ? 'light-content' : 'dark-content'} />
      {/* ================= Ads dialog ================= */}
      {store.ads.base64 && (
        <DialogBase64Ads
          appChannel={channel}
          visible={showAds}
          duration={5}
          autoClose
          onChangeVisible={setShowAds}
        />
      )}

      {/* ================= Startup loading ================= */}
      {!store.ads.base64 && loading && (
        <StartupLoadingScreen
          loading={loading}
          devModeEnabled
          onOpenDevLog={() => setShowResolverDialog(true)}
        />
      )}

      {/* ================= Error screen ================= */}
      {!store.urlEndPoint && (
        <StartupErrorScreen
          errorMsg={'No available lines found'}
          allFailed={allFailed}
          devModeEnabled
          onOpenDevLog={() => setShowResolverDialog(true)}
        />
      )}

      {/* ================= WebView ================= */}
      <AppContent />

      <HostResolverDialog
        visible={showResolverDialog}
        onChangeVisible={setShowResolverDialog}
      />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const store = useStore();
  const hasHost = !!store.urlEndPoint;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: safeAreaInsets.top,
          paddingBottom: safeAreaInsets.bottom,
          paddingLeft: safeAreaInsets.left,
          paddingRight: safeAreaInsets.right,
        },
      ]}
    >
      {/* ================= Success / WebView ================= */}
      {hasHost && (
        <StartupSuccessScreen
          urlEndPoint={store.urlEndPoint}
          apiEndPoint={store.apiEndPoint}
          showWebview
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  channelText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
});

export default App;
