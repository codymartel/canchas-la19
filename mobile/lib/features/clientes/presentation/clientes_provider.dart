import '../../../core/presentation/operacion.dart';
import '../../../core/domain/formatos.dart';
import '../data/clientes_repository.dart';

class ClientesProvider extends Operacion {
  final ClientesRepository repository;
  List<Registro> clientes = [], historial = [];
  Object? _cursor, _cursorHistoria;
  bool hayMas = false, masHistoria = false;
  String busqueda = '', clienteId = '';
  ClientesProvider(this.repository);
  Future<bool> buscar(String valor, {bool mas = false}) => realizar(() async {
    final pagina = await repository.buscar(valor, cursor: mas ? _cursor : null);
    busqueda = valor;
    clientes = [...(mas ? clientes : <Registro>[]), ...pagina.registros];
    _cursor = pagina.cursor;
    hayMas = pagina.hayMas;
  });
  Future<bool> cargarHistorial(String id, {bool mas = false}) =>
      realizar(() async {
        final pagina = await repository.historial(
          id,
          cursor: mas ? _cursorHistoria : null,
        );
        clienteId = id;
        historial = [...(mas ? historial : <Registro>[]), ...pagina.registros];
        _cursorHistoria = pagina.cursor;
        masHistoria = pagina.hayMas;
      });
  Future<bool> guardar(Map<String, dynamic> datos) =>
      conResultado(() => repository.guardar(datos));
}
