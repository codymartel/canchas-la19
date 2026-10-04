import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';

String normalizarWhatsappEmpleado(String valor) {
  var numero = valor.trim().replaceAll(RegExp(r'[\s().-]'), '');
  if (numero.isEmpty) return '';
  if (RegExp(r'^9[0-9]{8}$').hasMatch(numero)) {
    numero = '+51$numero';
  }
  if (!numero.startsWith('+') &&
      RegExp(r'^[1-9][0-9]{9,14}$').hasMatch(numero)) {
    numero = '+$numero';
  }
  if (!RegExp(r'^\+[1-9][0-9]{7,14}$').hasMatch(numero)) {
    throw const FormatException(
      'WhatsApp inválido. Usa +51 y el número, o incluye el código de tu país.',
    );
  }
  return numero;
}

class AltaEmpleado {
  final String uid, email, nombre;
  const AltaEmpleado({
    required this.uid,
    required this.email,
    required this.nombre,
  });
}

class EmpleadosRepository {
  final Servicios servicios;
  final String negocio;
  final String uidAdministrador;
  EmpleadosRepository(this.servicios, this.negocio, this.uidAdministrador);

  Stream<List<Registro>> empleados() =>
      observar(servicios.coleccion(negocio, 'empleados').limit(100));

  Stream<List<Registro>> responsables() =>
      observar(servicios.coleccion(negocio, 'responsablesCanchas'));

  Future<Resultado<void>> asignarPrincipal(
    String cancha,
    String uid,
  ) => servicios.guardando(() async {
    if (!esSede(cancha) || uid.isEmpty) {
      throw const FormatException('Selecciona cancha y empleado.');
    }
    final ref = servicios.doc(negocio, 'responsablesCanchas', cancha);
    await servicios.db.runTransaction((tx) async {
      final empleado = await tx.get(servicios.doc(negocio, 'empleados', uid));
      final anterior = await tx.get(ref);
      final e = empleado.data();
      if (e == null ||
          e['activo'] != true ||
          (e['permisos'] as Map?)?['reservas'] != true ||
          !(e['sedes'] as List? ?? []).contains(cancha)) {
        throw const FormatException(
          'El empleado debe estar activo, asignado a esta cancha y tener permiso de reservas.',
        );
      }
      if (anterior.data()?['empleadoUid'] == uid) return;
      final evento = ref.collection('historial').doc();
      tx.set(evento, {
        'anteriorUid': anterior.data()?['empleadoUid'] ?? '',
        'empleadoUid': uid,
        'actualizadoPor': servicios.uid,
        'actualizadoEn': FieldValue.serverTimestamp(),
      });
      tx.set(ref, {
        'empleadoUid': uid,
        'actualizadoPor': servicios.uid,
        'actualizadoEn': FieldValue.serverTimestamp(),
        'eventoId': evento.id,
      });
    });
  });

  Future<void> _autorizarPresencia(String uid, String nombre) =>
      servicios.realtime.ref('acceso/$negocio/$uid').set({
        'rol': 'empleado_control',
        'activo': true,
        'nombre': nombrePresencia(nombre),
      });

  Future<void> _revocarPresencia(String uid) =>
      servicios.realtime.ref('acceso/$negocio/$uid').remove();

  /// Crea la cuenta en Firebase Auth con una instancia secundaria para no
  /// cerrar la sesion del administrador, y recien despues registra el empleado.
  ///
  /// La escritura del documento la autorizan las reglas, no el cliente: si el
  /// administrador no fuera reconocido, el paso 2 falla y el alta se revierte
  /// logicalmente (la cuenta queda huerfana pero sin acceso).
  Future<Resultado<AltaEmpleado>> crearCuenta({
    required String email,
    required String clave,
  }) => servicios.guardando(() async {
    final correo = email.trim().toLowerCase();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(correo)) {
      throw const FormatException('Correo no valido.');
    }
    if (clave.length < 6) {
      throw const FormatException(
        'Usa una contrasena de al menos 6 caracteres.',
      );
    }
    final cred = await servicios.authAltas.createUserWithEmailAndPassword(
      email: correo,
      password: clave,
    );
    final alta = AltaEmpleado(
      uid: cred.user!.uid,
      email: correo,
      nombre: correo.split('@').first,
    );
    await servicios.authAltas.signOut();
    return alta;
  });

  Future<Resultado<void>> registrarEmpleado({
    required String uid,
    required String nombre,
    required String email,
    required Map<String, bool> permisos,
    required List<String> sedes,
    required String sedePrincipal,
    required bool activo,
    String whatsappReservas = '',
  }) => servicios.guardando(() async {
    if (uid == uidAdministrador) {
      throw const FormatException('No puedes crear un empleado con tu UID.');
    }
    if (nombre.trim().isEmpty) {
      throw const FormatException('Completa el nombre del empleado.');
    }
    if (sedes.isEmpty || sedes.any((s) => !esSede(s))) {
      throw const FormatException('Asigna al menos una sede valida.');
    }
    if (!sedes.contains(sedePrincipal)) {
      throw const FormatException('La sede principal debe estar asignada.');
    }
    if (permisos['agenda'] != true) {
      throw const FormatException('La agenda global es obligatoria.');
    }
    if (!activo) await _revocarPresencia(uid);
    final ficha = servicios.doc(negocio, 'empleados', uid);
    final usuario = servicios.db.doc('users/$uid');
    final lote = servicios.db.batch();
    lote.set(ficha, {
      'whatsappReservas': normalizarWhatsappEmpleado(whatsappReservas),
      'nombre': nombre.trim(),
      'email': email.trim().toLowerCase(),
      'rol': 'empleado_control',
      'activo': activo,
      'permisos': {for (final p in permisosClave) p: permisos[p] == true},
      'sedes': sedes,
      'sedePrincipal': sedePrincipal,
      'actualizadoPor': servicios.uid,
      'actualizadoEn': FieldValue.serverTimestamp(),
    });
    lote.set(usuario, {
      'negocioId': negocio,
      'email': email.trim().toLowerCase(),
    });
    await lote.commit();
    if (activo) await _autorizarPresencia(uid, nombre);
  });

  Future<Resultado<void>> guardar(Map<String, dynamic> datos) =>
      servicios.guardando(() async {
        final uid = '${datos['uid']}';
        if (uid == uidAdministrador) {
          throw const FormatException('No puedes modificar tu propio acceso.');
        }
        if (uid.isEmpty) {
          throw const FormatException('Identificador de empleado invalido.');
        }
        final sedes = List<String>.from(datos['sedes'] as List? ?? const []);
        final permisos = Map<String, bool>.from(
          (datos['permisos'] as Map?)?.cast<String, bool>() ?? const {},
        );
        final principal = '${datos['sedePrincipal']}';
        if (sedes.isEmpty || sedes.any((s) => !esSede(s))) {
          throw const FormatException('Asigna al menos una sede valida.');
        }
        if (!sedes.contains(principal)) {
          throw const FormatException('La sede principal debe estar asignada.');
        }
        if (permisos['agenda'] != true) {
          throw const FormatException('La agenda global es obligatoria.');
        }
        final whatsapp = datos.containsKey('whatsappReservas')
            ? normalizarWhatsappEmpleado('${datos['whatsappReservas'] ?? ''}')
            : null;
        final activo = datos['activo'] == true;
        if (!activo) await _revocarPresencia(uid);
        await servicios.doc(negocio, 'empleados', uid).set({
          'whatsappReservas': ?whatsapp,
          'nombre': '${datos['nombre']}'.trim(),
          'email': '${datos['email']}'.trim().toLowerCase(),
          'rol': 'empleado_control',
          'activo': activo,
          'permisos': {for (final p in permisosClave) p: permisos[p] == true},
          'sedes': sedes,
          'sedePrincipal': principal,
          'actualizadoPor': servicios.uid,
          'actualizadoEn': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
        if (activo) await _autorizarPresencia(uid, '${datos['nombre']}');
      });
}
