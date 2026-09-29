import 'package:flutter/material.dart';
import '../../../core/presentation/pantallas.dart';

class SinConfiguracionScreen extends StatelessWidget {
  final void Function() reintentar;
  final void Function() cerrarSesion;
  const SinConfiguracionScreen({
    super.key,
    required this.reintentar,
    required this.cerrarSesion,
  });

  @override
  Widget build(BuildContext context) => PantallaCentrada(
    titulo: 'Falta identificar al administrador',
    subtitulo: 'El documento sistema/grass todavia no existe en el proyecto.',
    children: [
      const Aviso(
        'Por seguridad el administrador inicial NO se define desde la app. '
        'Crear la cuenta en Firebase Authentication no basta: hay que '
        'registrar su UID una unica vez, y esa es la unica accion que puede '
        'otorgar el rol.',
        grave: true,
      ),
      const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Pasos, en este orden:\n'
            '1. Crea la cuenta en Firebase Authentication y verificá el correo.\n'
            '2. Copia su UID.\n'
            '3. Ejecuta, desde la carpeta functions:\n'
            '   npm run configurar-admin -- --uid <UID>\n'
            '4. Vuelve a esta pantalla.',
          ),
        ),
      ),
      BotonAccion('Comprobar de nuevo', onPressed: reintentar),
      BotonSecundario('Cerrar sesion', onPressed: cerrarSesion),
    ],
  );
}

class NoVinculadoScreen extends StatelessWidget {
  final String email;
  final bool desactivado;
  final void Function() reintentar;
  final void Function() cerrarSesion;
  const NoVinculadoScreen({
    super.key,
    required this.email,
    this.desactivado = false,
    required this.reintentar,
    required this.cerrarSesion,
  });

  @override
  Widget build(BuildContext context) => PantallaCentrada(
    titulo: desactivado
        ? 'Tu acceso esta desactivado'
        : 'Esta cuenta no esta vinculada al negocio',
    subtitulo: email,
    children: [
      Aviso(
        desactivado
            ? 'El administrador desactivo tu cuenta. Pide que la reactive para '
                  'volver a entrar.'
            : 'Solo el administrador de Grass Sintetico puede crear cuentas del '
                  'personal. Aqui no hay registro, solicitudes ni invitaciones.',
        grave: true,
      ),
      BotonAccion('Comprobar de nuevo', onPressed: reintentar),
      BotonSecundario('Cerrar sesion', onPressed: cerrarSesion),
    ],
  );
}
