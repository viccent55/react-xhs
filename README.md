
# Guide install
1. npm install 
2. starup => 
  - npx react-native start
  - npx react-native run-android

# open app 
1. npx react-native run-android
  # clean and rebuild 
    rm -rf node_modules
    rm -rf android/.gradle
    rm -rf android/build
    rm -rf android/app/build

    npm install
    cd android && ./gradlew clean && cd ..
    npx react-native run-android


#  Make VasDolly
 - android/build.gradle  add dependencies
   dependencies {
        classpath "com.tencent.vasdolly:plugin:3.0.6"
    }

 - android/app/build.gradle add react {} make use your node is v20.xxx and put it like this 

    react {
        nodeExecutableAndArgs = ["/Users/viccent/.nvm/versions/node/v20.19.6/bin/node"]
    }
    create a file index.js and import './index.ts';

- add 2 ChannelModule.java and ChannelPackage.java files in app/src/main/java/com/myapp/channel
 
 // ChannelModule.java
        package com.myapp.channel;

        import android.content.Context;
        import androidx.annotation.NonNull;
        import com.facebook.react.bridge.Promise;
        import com.facebook.react.bridge.ReactApplicationContext;
        import com.facebook.react.bridge.ReactContextBaseJavaModule;
        import com.facebook.react.bridge.ReactMethod;
        import com.tencent.vasdolly.helper.ChannelReaderUtil;

        public class ChannelModule extends ReactContextBaseJavaModule {

            public ChannelModule(ReactApplicationContext reactContext) {
                super(reactContext);
            }

            @NonNull
            @Override
            public String getName() {
                return "Channel";
            }

            @ReactMethod
            public void getChannel(Promise promise) {
                try {
                    Context context = getReactApplicationContext();
                    String channel = ChannelReaderUtil.getChannel(context);

                    if (channel == null || channel.isEmpty()) {
                        channel = "default-channel";
                    }

                    promise.resolve(channel);
                } catch (Throwable e) {
                    promise.resolve("error");
                }
            }
        }

 // ChannelPackage.java

    package com.myapp.channel;

    import com.facebook.react.ReactPackage;
    import com.facebook.react.bridge.NativeModule;
    import com.facebook.react.bridge.ReactApplicationContext;
    import com.facebook.react.uimanager.ViewManager;

    import java.util.ArrayList;
    import java.util.Collections;
    import java.util.List;

    public class ChannelPackage implements ReactPackage {

        @Override
        public List<NativeModule> createNativeModules(
                ReactApplicationContext reactContext) {
            List<NativeModule> modules = new ArrayList<>();
            modules.add(new ChannelModule(reactContext));
            return modules;
        }

        @Override
        public List<ViewManager> createViewManagers(
                ReactApplicationContext reactContext) {
            return Collections.emptyList();
        }
    }

    // than add it in MainApplication.kt
    import com.myapp.channel.ChannelPackage

    packageList =
        PackageList(this).packages.apply {
        // Register custom native modules
        add(ChannelPackage())
    },


2. change loading page (Splash Screen)

    - add assets directory icon.png and bootsplash.png
    - /android/app/src/res/mipxxxxxx/ rename bootsplash.png to ic_lanucher.png and ic_lanucher_round.png
        to all directory start with mipmapxxxxx


3. show ad (first time open not show)

