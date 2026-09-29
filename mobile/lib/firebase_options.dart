import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

abstract final class DefaultFirebaseOptions {
  static const projectId = 'glass-sintetico';
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => android,
      TargetPlatform.iOS => ios,
      TargetPlatform.windows => web,
      _ => throw UnsupportedError(
        'Registra esta plataforma en glass-sintetico antes de usarla.',
      ),
    };
  }

  static const web = FirebaseOptions(
    apiKey: 'AIzaSyCxZ3cbXROSZd67zp6WWe72iOpyDRVqrhc',
    appId: '1:666840330833:web:cf55eab78a7c087d68be70',
    messagingSenderId: '666840330833',
    projectId: projectId,
    authDomain: 'glass-sintetico.firebaseapp.com',
    storageBucket: 'glass-sintetico.firebasestorage.app',
    databaseURL: 'https://glass-sintetico-default-rtdb.firebaseio.com',
  );
  static const android = FirebaseOptions(
    apiKey: 'AIzaSyBm3pklUZ1nZYPCdMq_BUkJBxDO3Rj7CX4',
    appId: '1:666840330833:android:b0295de0063a8cf968be70',
    messagingSenderId: '666840330833',
    projectId: projectId,
    storageBucket: 'glass-sintetico.firebasestorage.app',
    databaseURL: 'https://glass-sintetico-default-rtdb.firebaseio.com',
  );
  static const ios = FirebaseOptions(
    apiKey: 'AIzaSyC0QzxnOqoj4lPa80nDW_QG3UtoDgXlhFY',
    appId: '1:666840330833:ios:45174d3d0ce7c1aa68be70',
    messagingSenderId: '666840330833',
    projectId: projectId,
    storageBucket: 'glass-sintetico.firebasestorage.app',
    databaseURL: 'https://glass-sintetico-default-rtdb.firebaseio.com',
    iosBundleId: 'com.example.mobile',
  );
}
