import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const MAX_SOFT_RETRY = 1; // tolerate slow network once
const MAX_HARD_RETRY = 2; // real retry before showing error

type Props = {
  urlEndPoint: string;
  apiEndPoint: string;
  showWebview?: boolean;
  devModeEnabled?: boolean;
};

export default function StartupSuccessScreen({
  urlEndPoint,
  apiEndPoint,
  showWebview: defaultShow = false,
  devModeEnabled = false,
}: Props) {
  const webviewRef = useRef<WebView>(null);

  const [showWebview, setShowWebview] = useState(defaultShow);
  const [isLoading, setIsLoading] = useState(true);
  const [webError, setWebError] = useState<string | null>(null);

  const [retryCount, setRetryCount] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  /* fade animation */
  const fadeAnim = useRef(new Animated.Value(1)).current;

  /* ===============================
   * Helpers
   * =============================== */
  function enterHome() {
    setShowWebview(true);
  }

  function injectWindowKey() {
    const payload = {
      type: 'INIT_ENV',
      api: apiEndPoint,
      platform: 'react-native',
    };

    webviewRef.current?.injectJavaScript(`
      window.postMessage(${JSON.stringify(payload)}, "*");
      true;
    `);
  }

  function hideLoader() {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setIsLoading(false));
  }

  /* ===============================
   * Web failure handler (SMART)
   * =============================== */
  function handleWebFailure(reason: string) {
    console.log('🌐 WebView failure:', reason);

    // 🟢 First load never succeeded → tolerate once (slow network)
    if (!hasLoadedOnce && retryCount < MAX_SOFT_RETRY) {
      setRetryCount(c => c + 1);
      webviewRef.current?.reload();
      return;
    }

    // 🟡 Retry current URL a bit more
    if (retryCount < MAX_HARD_RETRY) {
      setRetryCount(c => c + 1);
      webviewRef.current?.reload();
      return;
    }

    // 🔴 REAL failure → show error UI
    setWebError('页面加载失败，请检查网络或稍后重试');
    setIsLoading(false);
  }

  /* ===============================
   * Startup screen
   * =============================== */
  if (!showWebview) {
    return (
      <SafeAreaView style={styles.startupContainer}>
        <View style={styles.centerBox}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>线路检测完成</Text>
          <Text style={styles.successSubtitle}>
            已为您找到可用线路：
            {'\n'}
            <Text style={styles.primaryText}>{urlEndPoint}</Text>
          </Text>

          <Pressable style={styles.enterBtn} onPress={enterHome}>
            <Text style={styles.enterBtnText}>进入首页</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* ===============================
   * WebView + Loader + Error
   * =============================== */
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <WebView
        ref={webviewRef}
        source={{ uri: urlEndPoint }}
        style={styles.webview}
        onLoadStart={() => {
          setWebError(null);
          setIsLoading(true);
          fadeAnim.setValue(1);
        }}
        onLoadEnd={() => {
          setHasLoadedOnce(true);
          injectWindowKey();
          hideLoader();
        }}
        onError={e => {
          console.error('WebView error:', e.nativeEvent);
          handleWebFailure('onError');
        }}
        onHttpError={e => {
          handleWebFailure(`HTTP ${e.nativeEvent.statusCode}`);
        }}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
      />

      {/* ⏳ Loading Overlay */}
      {isLoading && (
        <Animated.View style={[styles.loadingMask, { opacity: fadeAnim }]}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>正在加载，请稍候…</Text>
        </Animated.View>
      )}

      {/* ❌ Error Overlay (REAL failure only) */}
      {webError && (
        <View style={styles.errorMask}>
          <Text style={styles.errorText}>{webError}</Text>

          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setRetryCount(0);
              setWebError(null);
              setIsLoading(true);
              fadeAnim.setValue(1);
              webviewRef.current?.reload();
            }}
          >
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ===============================
 * Styles
 * =============================== */
const styles = StyleSheet.create({
  startupContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  successIcon: { fontSize: 40 },
  successTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  successSubtitle: { color: '#fff', textAlign: 'center' },
  primaryText: { color: '#2563eb' },

  enterBtn: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  enterBtnText: { color: '#fff', fontWeight: '600' },

  webview: { flex: 1 },

  loadingMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.85,
  },

  errorMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
