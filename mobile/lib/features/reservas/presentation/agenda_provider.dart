import 'dart:async';
import '../../../core/presentation/operacion.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../domain/reserva.dart';
import '../data/reservas_repository.dart';
import '../application/gestionar_reserva.dart';

class AgendaProvider extends Operacion {
  final ReservasRepository repository;
  late final GestionarReserva gestionar = GestionarReserva(repository);
  String dia = diaOperativoLima(), sede = '';
  bool cargando = true;
  String? errorCarga;
  bool desdeCache = false, escriturasPendientes = false;
  bool _reservasCache = false, _bloqueosCache = false;
  bool _reservasPendientes = false, _bloqueosPendientes = false;
  List<Reserva> _reservas = [], _bloqueos = [];
  final Map<String, Set<int>> ocupacionPorCancha = {};
  final Map<String, bool> _ocupacionCache = {}, _ocupacionPendiente = {};
  StreamSubscription<LecturaReservas>? _sub, _subBloqueos;
  final List<StreamSubscription<LecturaOcupacion>> _subsOcupacion = [];
  var revision = 0;
  late final Timer _medianoche;
  bool _siguiendoHoy = true;
  AgendaProvider(this.repository) {
    cargar();
    _medianoche = Timer.periodic(const Duration(minutes: 1), (_) {
      final hoy = diaOperativoLima();
      if (_siguiendoHoy && dia != hoy) {
        dia = hoy;
        cargar();
      }
    });
  }
  List<Reserva> get todasFilas =>
      [..._reservas, ..._bloqueos]
        ..sort((a, b) => a.minutoEnDia(dia).compareTo(b.minutoEnDia(dia)));
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
    _siguiendoHoy = valor == diaOperativoLima();
    cargar();
  }

  void cargar() {
    final rev = ++revision;
    _sub?.cancel();
    _subBloqueos?.cancel();
    for (final sub in _subsOcupacion) {
      sub.cancel();
    }
    _subsOcupacion.clear();
    _reservas = [];
    _bloqueos = [];
    ocupacionPorCancha.clear();
    _ocupacionCache.clear();
    _ocupacionPendiente.clear();
    _reservasCache = _bloqueosCache = false;
    _reservasPendientes = _bloqueosPendientes = false;
    desdeCache = escriturasPendientes = false;
    cargando = true;
    errorCarga = null;
    var rListas = false, bListos = false;
    final ocupacionLista = <String>{};
    void estadoLectura() {
      desdeCache =
          _reservasCache ||
          _bloqueosCache ||
          _ocupacionCache.values.any((valor) => valor);
      escriturasPendientes =
          _reservasPendientes ||
          _bloqueosPendientes ||
          _ocupacionPendiente.values.any((valor) => valor);
      cargando =
          !(rListas && bListos && ocupacionLista.length == sedesIds.length);
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
    for (final cancha in sedesIds) {
      _subsOcupacion.add(
        repository.observarOcupacion(cancha, dia).listen((lectura) {
          if (rev != revision) return;
          ocupacionPorCancha[cancha] = lectura.minutos;
          _ocupacionCache[cancha] = lectura.desdeCache;
          _ocupacionPendiente[cancha] = lectura.pendientes;
          ocupacionLista.add(cancha);
          estadoLectura();
        }, onError: fallo),
      );
    }
    notificar();
  }

  Future<bool> registrar(Map<String, dynamic> datos) =>
      conResultado(() => gestionar.registrar(datos));
  Future<bool> registrarEfectivo(Reserva r, int monto, int cobro, String id) =>
      conResultado(
        () => repository.registrarEfectivo(
          id: r.id,
          version: r.entero('version'),
          monto: monto,
          cobro: cobro,
          operacionId: id,
        ),
      );
  Future<bool> actualizar(Reserva r, String estado) => conResultado(
    () => repository.actualizar({
      'id': r.id,
      'bloqueo': r.bloqueo,
      'version': r.entero('version'),
      'estado': estado,
    }),
  );
  @override
  void dispose() {
    revision++;
    _sub?.cancel();
    _subBloqueos?.cancel();
    for (final sub in _subsOcupacion) {
      sub.cancel();
    }
    _medianoche.cancel();
    super.dispose();
  }
}
