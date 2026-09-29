import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart' show FirebaseDatabase;
import '../domain/formatos.dart';
import '../domain/resultado.dart';

class Servicios {
  final FirebaseFirestore db;
  final FirebaseAuth auth;
  final FirebaseAuth authAltas;
  final FirebaseDatabase realtime;
  Servicios({
    required this.db,
    required this.auth,
    required this.authAltas,
    required this.realtime,
  });

  String get uid => auth.currentUser?.uid ?? '';

  CollectionReference<Map<String, dynamic>> coleccion(
    String negocio,
    String nombre,
  ) => db.collection('negocios').doc(negocio).collection(nombre);

  DocumentReference<Map<String, dynamic>> doc(
    String negocio,
    String nombre, [
    String? id,
  ]) => db.collection('negocios').doc(negocio).collection(nombre).doc(id ?? '');

  Future<Resultado<T>> guardando<T>(Future<T> Function() tarea) async {
    try {
      return Ok(await tarea());
    } catch (e) {
      return Fallo(mensajeError(e));
    }
  }
}

/// Instancia secundaria de Firebase Auth: crear la cuenta de un empleado no
/// debe cerrar la sesion del administrador.
Future<FirebaseAuth> authSecundaria(FirebaseOptions options) async {
  const nombre = 'altas';
  final existentes = Firebase.apps.where((a) => a.name == nombre).toList();
  final FirebaseApp app = existentes.isNotEmpty
      ? existentes.first
      : await Firebase.initializeApp(name: nombre, options: options);
  return FirebaseAuth.instanceFor(app: app);
}

Registro convertir(DocumentSnapshot<Map<String, dynamic>> doc) => Registro(
  doc.id,
  (doc.data() ?? {}).map(
    (key, value) =>
        MapEntry(key, value is Timestamp ? value.toDate().toUtc() : value),
  ),
);
Stream<List<Registro>> observar(Query<Map<String, dynamic>> consulta) =>
    consulta.snapshots().map((s) => s.docs.map(convertir).toList());

String mensajeError(Object error) {
  if (error is FormatException) return error.message;
  if (error is FirebaseException) {
    return switch (error.code) {
      'permission-denied' =>
        'Las reglas de seguridad rechazaron la operacion o no tienes permiso.',
      'unavailable' || 'deadline-exceeded' =>
        'No se confirmo el resultado. Reintenta la misma operacion para no duplicar.',
      'failed-precondition' =>
        'La operacion no cumple una precondicion del negocio.',
      'already-exists' => 'Ese registro ya existe.',
      'aborted' => 'Otra operacion esta en curso. Actualiza y reintenta.',
      'invalid-credential' ||
      'wrong-password' ||
      'user-not-found' ||
      'invalid-login-credentials' => 'Correo o contrasena incorrectos.',
      'email-already-in-use' =>
        'Ese correo ya tiene cuenta. Reutiliza el mismo correo para no duplicar su perfil.',
      'weak-password' => 'Usa una contrasena de al menos 6 caracteres.',
      'invalid-email' => 'Correo no valido.',
      'network-request-failed' =>
        'Sin conexion. Comprueba internet y reintenta.',
      'too-many-requests' => 'Demasiados intentos. Espera y reintenta.',
      _ => 'No se pudo completar la operacion (${error.code}).',
    };
  }
  return 'No se pudo completar la operacion. Reintenta. [${error.runtimeType}]';
}
