import 'package:flutter/material.dart';
import '../../../core/presentation/componentes.dart';
import '../../../core/presentation/pantallas.dart';
import 'acceso_provider.dart';

class LoginScreen extends StatefulWidget {
  final AccesoProvider provider;
  const LoginScreen({super.key, required this.provider});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final clave = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    clave.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.provider;
    return PantallaCentrada(
      titulo: 'Grass Sintetico',
      subtitulo: 'Acceso del personal · La 19 / La 23 / La 24',
      children: [
        if (p.mensaje != null) Aviso(p.mensaje!),
        if (p.error != null) Aviso(p.error!, grave: true),
        Campo('Correo', email, tipo: TextInputType.emailAddress),
        Campo('Contrasena', clave, secreto: true),
        BotonAccion(
          'Ingresar',
          cargando: p.ocupado,
          onPressed: () => p.ingresar(email.text, clave.text),
        ),
        BotonSecundario(
          'Recuperar contrasena',
          onPressed: p.ocupado ? null : () => p.recuperar(email.text),
        ),
      ],
    );
  }
}
