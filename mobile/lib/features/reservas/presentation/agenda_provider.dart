import 'dart:async';
import '../../../core/presentation/operacion.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../domain/reserva.dart';
import '../data/reservas_repository.dart';
import '../application/gestionar_reserva.dart';

class AgendaProvider extends Operacion {
  final ReservasRepository repository;
  late final GestionarReserva gestionar = GestionarReserva(repository);
  String dia = fechaLima(), sede = '';
  bool cargando = true;
  String? errorCarga;
  bool desdeCache = false, escriturasPendientes = false;
  bool _reservasCache = false, _bloqueosCache = false;
  bool _reservasSiguienteCache = false, _bloqueosSiguienteCache = false;
  bool _reservasPendientes = false, _bloqueosPendientes = false;
  bool _reservasSiguientePendientes = false,
      _bloqueosSiguientePendientes = false;
  List<Reserva> _reservas = [], _bloqueos = [];
  List<Reserva> _reservasSiguiente = [], _bloqueosSiguiente = [];
  StreamSubscription<LecturaReservas>? _sub,
      _subBloqueos,
      _subSiguiente,
      _subBloqueosSiguiente;
  var revision = 0;
  late final Timer _medianoche;
  bool _siguiendoHoy = true;
  AgendaProvider(this.repository) {
    cargar();
    _medianoche = Timer.periodic(const Duration(minutes: 1), (_) {
      final hoy = fechaLima();
      if (_siguiendoHoy && dia != hoy) {
        dia = hoy;
        cargar();
      }
    });
  }
  List<Reserva> get todasFilas =>
      [..._reservas, ..._bloqueos]
        ..sort((a, b) => a.minutoEnDia(dia).compareTo(b.minutoEnDia(dia)));
  List<Reserva> get ocupacionesDisponibilidad => [
    ..._reservas,
    ..._bloqueos,
    ..._reservasSiguiente,
    ..._bloqueosSiguiente,
  ];
  List<Reserva> get filas =>
      [
          ..._reservas,
          ..._bloqueos,
        ].where((r) => sede.isEmpty || r.texto('sedeId') == sede).toList()
        ..sort((a, b) => a.minutoEnDia(dia).compareTo(b.minutoEnDia(dia)));
  void seleccionarSede(String valor) {
    sede = valor;
    notificar();
  }

  void cambiarDia(String valor) {
    dia = valor;
    _siguiendoHoy = valor == fechaLima();
    cargar();
  }

  void cargar() {
    final rev = ++revision;
    _sub?.cancel();
    _subBloqueos?.cancel();
    _subSiguiente?.cancel();
    _subBloqueosSiguiente?.cancel();
    _reservas = [];
    _bloqueos = [];
    _reservasSiguiente = [];
    _bloqueosSiguiente = [];
    _reservasCache = _bloqueosCache = _reservasSiguienteCache =
        _bloqueosSiguienteCache = false;
    _reservasPendientes = _bloqueosPendientes = _reservasSiguientePendientes =
        _bloqueosSiguientePendientes = false;
    desdeCache = escriturasPendientes = false;
    cargando = true;
    errorCarga = null;
    var rListas = false, bListos = false, rsListas = false, bsListos = false;
    void estadoLectura() {
      desdeCache =
          _reservasCache ||
          _bloqueosCache ||
          _reservasSiguienteCache ||
          _bloqueosSiguienteCache;
      escriturasPendientes =
          _reservasPendientes ||
          _bloqueosPendientes ||
          _reservasSiguientePendientes ||
          _bloqueosSiguientePendientes;
      cargando = !(rListas && bListos && rsListas && bsListos);
      notificar();
    }

    void fallo(Object e) {
      if (rev != revision) return;
      errorCarga = mensajeError(e);
      cargando = false;
      notificar();
    }

    _sub = repository.observarDia(dia).listen((lectura) {
      if (rev != revision) return;
      _reservas = lectura.reservas;
      _reservasCache = lectura.desdeCache;
      _reservasPendientes = lectura.pendientes;
      rListas = true;
      estadoLectura();
    }, onError: fallo);
    _subBloqueos = repository.observarDia(dia, bloqueos: true).listen((
      lectura,
    ) {
      if (rev != revision) return;
      _bloqueos = lectura.reservas;
      _bloqueosCache = lectura.desdeCache;
      _bloqueosPendientes = lectura.pendientes;
      bListos = true;
      estadoLectura();
    }, onError: fallo);
    final siguiente = DateTime.parse(
      dia,
    ).add(const Duration(days: 1)).toIso8601String().substring(0, 10);
    _subSiguiente = repository.observarDia(siguiente).listen((lectura) {
      if (rev != revision) return;
      _reservasSiguiente = lectura.reservas;
      _reservasSiguienteCache = lectura.desdeCache;
      _reservasSiguientePendientes = lectura.pendientes;
      rsListas = true;
      estadoLectura();
    }, onError: fallo);
    _subBloqueosSiguiente = repository
        .observarDia(siguiente, bloqueos: true)
        .listen((lectura) {
          if (rev != revision) return;
          _bloqueosSiguiente = lectura.reservas;
          _bloqueosSiguienteCache = lectura.desdeCache;
          _bloqueosSiguientePendientes = lectura.pendientes;
          bsListos = true;
          estadoLectura();
        }, onError: fallo);
    notificar();
  }

  Future<bool> registrar(Map<String, dynamic> datos) =>
      conResultado(() => gestionar.registrar(datos));
  Future<bool> actualizar(
    Reserva r,
    String estado,
    int adelanto, {
    int? monto,
  }) => conResultado(
    () => repository.actualizar({
      'id': r.id,
      'bloqueo': r.bloqueo,
      'version': r.entero('version'),
      'estado': estado,
      'adelantoCentimos': adelanto,
      'montoCentimos': monto ?? r.monto,
    }),
  );
  @override
  void dispose() {
    revision++;
    _sub?.cancel();
    _subBloqueos?.cancel();
    _subSiguiente?.cancel();
    _subBloqueosSiguiente?.cancel();
    _medianoche.cancel();
    super.dispose();
  }
}
