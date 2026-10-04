import 'package:flutter/material.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/presentation/componentes.dart';
import '../../../core/presentation/pantallas.dart';
import 'empleados_provider.dart';

class EmpleadosScreen extends StatelessWidget {
  final EmpleadosProvider provider;
  const EmpleadosScreen({super.key, required this.provider});
  void editar(BuildContext context, Registro r) => showDialog<void>(
    context: context,
    builder: (_) => EmpleadoDialog(provider: provider, empleado: r),
  );
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Text(
        'Alta de empleado',
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const Text(
        'Crea la cuenta y asigna permisos, sedes y estado en el mismo paso. '
        'El empleado inicia sesion por separado, sin una pantalla obligatoria '
        'de verificacion. No hay solicitudes ni invitaciones: solo tu decides.',
      ),
      FilledButton.icon(
        onPressed: () => showDialog<void>(
          context: context,
          builder: (_) => AltaEmpleadoDialog(provider: provider),
        ),
        icon: const Icon(Icons.person_add),
        label: const Text('Crear cuenta de empleado'),
      ),
      if (provider.creado != null)
        Card(
          child: ListTile(
            title: Text('Creado: ${provider.creado!.email}'),
            subtitle: Text('UID ${provider.creado!.uid}'),
            trailing: const Icon(Icons.check_circle),
          ),
        ),
      const SizedBox(height: 16),
      Text('Empleados', style: Theme.of(context).textTheme.headlineSmall),
      ListaDatos(
        stream: provider.empleados,
        builder: (context, lista) => Column(
          children: [
            if (lista.isEmpty)
              const ListTile(title: Text('No hay empleados dados de alta.')),
            _ResponsablesCanchas(provider: provider, empleados: lista),
            for (final e in lista)
              Card(
                child: ListTile(
                  onTap: () => editar(context, e),
                  title: Text(
                    '${e.texto('nombre')} · ${e.activo('activo') ? 'Activo' : 'Inactivo'}',
                  ),
                  subtitle: Text(
                    '${e.texto('email')}\n${e.texto('rol')} · principal: ${sedes[e.texto('sedePrincipal')] ?? 'Sin asignar'}\nAsignadas: ${(e.datos['sedes'] as List? ?? const []).join(', ')}\nPermisos: ${(e.datos['permisos'] as Map? ?? const {}).entries.where((p) => p.value == true).map((p) => p.key).join(', ')}',
                  ),
                  isThreeLine: false,
                  trailing: const Icon(Icons.edit),
                ),
              ),
          ],
        ),
      ),
    ],
  );
}

class _FormularioEmpleado extends StatefulWidget {
  final EmpleadosProvider provider;
  final Registro? empleado;
  final bool alta;
  const _FormularioEmpleado({
    required this.provider,
    this.empleado,
    this.alta = false,
  });
  @override
  State<_FormularioEmpleado> createState() => _FormularioEmpleadoState();
}

class _FormularioEmpleadoState extends State<_FormularioEmpleado> {
  late final nombre = TextEditingController(
    text: widget.empleado?.texto('nombre'),
  );
  late final email = TextEditingController(
    text: widget.empleado?.texto('email'),
  );
  late final whatsapp = TextEditingController(
    text: widget.empleado?.texto('whatsappReservas'),
  );
  late final clave = TextEditingController();
  late var activo = widget.empleado?.datos['activo'] != false;
  late var principal = widget.empleado?.texto('sedePrincipal').isEmpty ?? true
      ? 'la-19'
      : widget.empleado?.texto('sedePrincipal') ?? 'la-19';
  late final asignadas = Set<String>.from(
    widget.empleado?.datos['sedes'] as List? ?? sedes.keys,
  );
  late final permisos = Map<String, bool>.from(
    (widget.empleado?.datos['permisos'] as Map?)?.cast<String, bool>() ??
        {for (final p in permisosClave) p: true},
  );

  @override
  void dispose() {
    nombre.dispose();
    email.dispose();
    clave.dispose();
    whatsapp.dispose();
    super.dispose();
  }

  Map<String, dynamic> _datos() => {
    'uid': widget.empleado?.id ?? '',
    'nombre': nombre.text,
    'whatsappReservas': whatsapp.text,
    'email': email.text,
    'activo': activo,
    'sedes': asignadas.toList(),
    'sedePrincipal': principal,
    'permisos': {...permisos, 'agenda': true},
  };

  @override
  Widget build(BuildContext context) {
    final p = widget.provider;
    return FormDialog(
      titulo: widget.alta ? 'Crear cuenta de empleado' : 'Editar empleado',
      children: [
        Campo('Nombre completo', nombre),
        Campo(
          'WhatsApp para recibir reservas',
          whatsapp,
          tipo: TextInputType.phone,
        ),
        const Text(
          'Incluye el código de país, por ejemplo +51. Puede quedar pendiente; no se enviarán mensajes todavía.',
        ),
        if (widget.alta) ...[
          Campo('Correo del empleado', email, tipo: TextInputType.emailAddress),
          Campo('Contrasena inicial', clave, secreto: true),
        ] else
          Text('Correo: ${widget.empleado?.texto('email')}'),
        if (widget.alta)
          const Text(
            'La cuenta se crea con una instancia secundaria de Firebase Auth: '
            'tu sesion de administrador no se cierra.',
          ),
        SwitchListTile(
          title: const Text('Acceso activo'),
          subtitle: Text(
            widget.alta
                ? 'Activa de inmediato: el empleado entra solo con su correo y contrasena.'
                : 'Al desactivar, el empleado pierde el acceso al panel.',
          ),
          value: activo,
          onChanged: (v) => setState(() => activo = v),
        ),
        const Text(
          'Agenda global compartida. Las sedes indican responsabilidad operativa.',
        ),
        for (final s in sedes.entries)
          CheckboxListTile(
            title: Text(s.value),
            value: asignadas.contains(s.key),
            onChanged: (v) => setState(() {
              if (v!) {
                asignadas.add(s.key);
              } else {
                asignadas.remove(s.key);
              }
            }),
          ),
        DropdownButton<String>(
          value: principal,
          isExpanded: true,
          items: sedes.entries
              .map(
                (s) => DropdownMenuItem(
                  value: s.key,
                  child: Text('Principal: ${s.value}'),
                ),
              )
              .toList(),
          onChanged: (v) => setState(() => principal = v!),
        ),
        for (final k in permisosClave.where((k) => k != 'agenda'))
          CheckboxListTile(
            title: Text('Gestionar $k'),
            value: permisos[k] ?? false,
            onChanged: (v) => setState(() => permisos[k] = v!),
          ),
        const Text('La agenda global no se puede revocar.'),
        ListenableBuilder(
          listenable: p,
          builder: (context, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (p.error != null) Aviso(p.error!, grave: true),
              if (p.aviso != null) Aviso(p.aviso!),
              if (p.creado != null) Aviso('UID creado: ${p.creado!.uid}'),
              BotonGuardar(
                operacion: p,
                texto: widget.alta ? 'Crear cuenta' : 'Guardar cambios',
                onPressed: () async {
                  final ok = widget.alta
                      ? await p.crearEmpleado(
                          nombre: nombre.text,
                          email: email.text,
                          clave: clave.text,
                          permisos: {...permisos, 'agenda': true},
                          sedes: asignadas.toList(),
                          sedePrincipal: principal,
                          activo: activo,
                          whatsappReservas: whatsapp.text,
                        )
                      : await p.guardar(_datos());
                  if (ok && context.mounted) Navigator.pop(context);
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class EmpleadoDialog extends StatelessWidget {
  final EmpleadosProvider provider;
  final Registro empleado;
  const EmpleadoDialog({
    super.key,
    required this.provider,
    required this.empleado,
  });
  @override
  Widget build(BuildContext context) =>
      _FormularioEmpleado(provider: provider, empleado: empleado);
}

class AltaEmpleadoDialog extends StatelessWidget {
  final EmpleadosProvider provider;
  const AltaEmpleadoDialog({super.key, required this.provider});
  @override
  Widget build(BuildContext context) =>
      _FormularioEmpleado(provider: provider, alta: true);
}

class _ResponsablesCanchas extends StatelessWidget {
  final EmpleadosProvider provider;
  final List<Registro> empleados;
  const _ResponsablesCanchas({required this.provider, required this.empleados});
  @override
  Widget build(BuildContext context) => ListaDatos(
    stream: provider.responsables,
    builder: (context, responsables) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Empleado principal por cancha',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const Text(
          'Selecciona un empleado activo con permiso de reservas y esta cancha asignada. No modifica las reservas anteriores ni los permisos de otros empleados.',
        ),
        for (final cancha in sedesIds)
          Card(
            child: ListTile(
              title: Text(sedes[cancha]!),
              subtitle: Text(() {
                final r = responsables.where((r) => r.id == cancha).firstOrNull;
                final e = empleados
                    .where((e) => e.id == r?.texto('empleadoUid'))
                    .firstOrNull;
                return e == null
                    ? 'Sin principal designado'
                    : '${e.texto('nombre')}${e.activo('activo') ? '' : ' · Inactivo: revisar asignación'}\nWhatsApp: ${e.texto('whatsappReservas').isEmpty ? 'Pendiente de configurar' : e.texto('whatsappReservas')}';
              }()),
              trailing: TextButton(
                child: const Text('Asignar'),
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => _AsignarPrincipal(
                    provider: provider,
                    cancha: cancha,
                    empleados: empleados,
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _AsignarPrincipal extends StatefulWidget {
  final EmpleadosProvider provider;
  final String cancha;
  final List<Registro> empleados;
  const _AsignarPrincipal({
    required this.provider,
    required this.cancha,
    required this.empleados,
  });
  @override
  State<_AsignarPrincipal> createState() => _AsignarPrincipalState();
}

class _AsignarPrincipalState extends State<_AsignarPrincipal> {
  String? uid;
  @override
  Widget build(BuildContext context) {
    final disponibles = widget.empleados
        .where(
          (e) =>
              e.activo('activo') &&
              (e.datos['permisos'] as Map?)?['reservas'] == true &&
              (e.datos['sedes'] as List? ?? []).contains(widget.cancha),
        )
        .toList();
    return AlertDialog(
      title: Text('Principal de ${sedes[widget.cancha]}'),
      content: SizedBox(
        width: 440,
        child: ListenableBuilder(
          listenable: widget.provider,
          builder: (context, _) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (disponibles.isEmpty)
                const Text(
                  'No hay empleados elegibles. Edita sus canchas y permiso de reservas primero.',
                ),
              if (disponibles.isNotEmpty)
                DropdownButton<String>(
                  isExpanded: true,
                  value: uid,
                  hint: const Text('Seleccionar empleado'),
                  items: disponibles
                      .map(
                        (e) => DropdownMenuItem(
                          value: e.id,
                          child: Text(e.texto('nombre')),
                        ),
                      )
                      .toList(),
                  onChanged: widget.provider.ocupado
                      ? null
                      : (v) => setState(() => uid = v),
                ),
              if (widget.provider.error != null)
                Aviso(widget.provider.error!, grave: true),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        ListenableBuilder(
          listenable: widget.provider,
          builder: (context, _) => FilledButton(
            onPressed: uid == null || widget.provider.ocupado
                ? null
                : () async {
                    final ok = await widget.provider.asignarPrincipal(
                      widget.cancha,
                      uid!,
                    );
                    if (ok && context.mounted) Navigator.pop(context);
                  },
            child: const Text('Guardar principal'),
          ),
        ),
      ],
    );
  }
}
