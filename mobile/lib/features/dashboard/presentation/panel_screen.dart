import 'package:flutter/material.dart';
import '../../acceso/domain/sesion.dart';
import '../../acceso/presentation/acceso_provider.dart';
import '../../configuracion/presentation/configuracion_provider.dart';
import '../../configuracion/presentation/configuracion_screen.dart';
import '../../reservas/presentation/agenda_provider.dart';
import '../../reservas/presentation/agenda_screen.dart';
import '../../sedes/presentation/sedes_provider.dart';
import '../../sedes/presentation/sedes_screen.dart';
import '../../sedes/presentation/parametros_screen.dart';
import '../../clientes/presentation/clientes_provider.dart';
import '../../clientes/presentation/clientes_screen.dart';
import '../../empleados/presentation/empleados_provider.dart';
import '../../empleados/presentation/empleados_screen.dart';
import '../../promociones/presentation/promociones_provider.dart';
import '../../promociones/presentation/promociones_screen.dart';
import '../../presencia/presentation/presencia_provider.dart';
import '../../../core/domain/formatos.dart';

class PanelScreen extends StatefulWidget {
  final Sesion sesion;
  final AccesoProvider acceso;
  final AgendaProvider agenda;
  final SedesProvider sedes;
  final ClientesProvider clientes;
  final EmpleadosProvider empleados;
  final PromocionesProvider promociones;
  final ConfiguracionProvider configuracion;
  final PresenciaProvider presencia;
  const PanelScreen({
    super.key,
    required this.sesion,
    required this.acceso,
    required this.agenda,
    required this.sedes,
    required this.clientes,
    required this.empleados,
    required this.promociones,
    required this.configuracion,
    required this.presencia,
  });
  @override
  State<PanelScreen> createState() => _PanelScreenState();
}

class _PanelScreenState extends State<PanelScreen> {
  int indice = 0;
  @override
  Widget build(BuildContext context) {
    final s = widget.sesion;
    final destinos = <({String titulo, IconData icono, Widget pantalla})>[
      (
        titulo: 'Agenda',
        icono: Icons.calendar_month,
        pantalla: AgendaScreen(
          provider: widget.agenda,
          sedesProvider: widget.sedes,
          clientes: widget.clientes,
          puedeEscribir: s.permite('reservas'),
          puedeClientes: s.permite('clientes'),
          presencia: widget.presencia,
          nombrePersonal: nombrePresencia(
            s.nombre ?? s.email?.split('@').first ?? 'Personal',
          ),
        ),
      ),
      if (s.permite('clientes'))
        (
          titulo: 'Clientes',
          icono: Icons.people,
          pantalla: ClientesScreen(provider: widget.clientes),
        ),
      (
        titulo: 'Promociones',
        icono: Icons.local_offer,
        pantalla: PromocionesScreen(
          provider: widget.promociones,
          puedeEditar: s.permite('promociones'),
        ),
      ),
      (
        titulo: 'Precios y adelantos',
        icono: Icons.price_change,
        pantalla: ParametrosScreen(
          provider: widget.sedes,
          uid: s.uid!,
          administrador: s.administrador,
        ),
      ),
      if (s.administrador)
        (
          titulo: 'Empleados',
          icono: Icons.badge,
          pantalla: EmpleadosScreen(provider: widget.empleados),
        ),
      if (s.administrador)
        (
          titulo: 'Canchas',
          icono: Icons.sports_soccer,
          pantalla: SedesScreen(provider: widget.sedes),
        ),
      if (s.esAdministrador)
        (
          titulo: 'Configuracion',
          icono: Icons.settings,
          pantalla: ConfiguracionScreen(provider: widget.configuracion),
        ),
    ];
    if (indice >= destinos.length) indice = 0;
    return LayoutBuilder(
      builder: (context, c) {
        final amplia = c.maxWidth >= 1000;
        return Scaffold(
          drawer: amplia
              ? null
              : NavigationDrawer(
                  selectedIndex: indice,
                  onDestinationSelected: (i) {
                    setState(() => indice = i);
                    Navigator.pop(context);
                  },
                  children: [
                    const Padding(
                      padding: EdgeInsets.fromLTRB(28, 24, 16, 12),
                      child: Text(
                        'Grass Sintetico',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    ...destinos.map(
                      (d) => NavigationDrawerDestination(
                        icon: Icon(d.icono),
                        label: Text(d.titulo),
                      ),
                    ),
                  ],
                ),
          appBar: AppBar(
            title: Text('Grass Sintético · ${destinos[indice].titulo}'),
            actions: [
              IconButton(
                tooltip: 'Cerrar sesión (${s.email})',
                onPressed: widget.acceso.ocupado ? null : widget.acceso.salir,
                icon: const Icon(Icons.logout),
              ),
            ],
          ),
          body: Row(
            children: [
              if (amplia)
                NavigationRail(
                  selectedIndex: indice,
                  labelType: NavigationRailLabelType.all,
                  onDestinationSelected: (i) => setState(() => indice = i),
                  destinations: destinos
                      .map(
                        (d) => NavigationRailDestination(
                          icon: Icon(d.icono),
                          label: Text(d.titulo),
                        ),
                      )
                      .toList(),
                ),
              Expanded(child: destinos[indice].pantalla),
            ],
          ),
        );
      },
    );
  }
}
