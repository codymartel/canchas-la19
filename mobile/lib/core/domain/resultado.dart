/// Resultado de una operacion: o un valor, o un mensaje que la interfaz pueda
/// mostrar. Los repositorios nunca lanzan excepciones de Firebase a la vista.
///
/// `esError` se decide por la presencia de mensaje y no por el tipo generico,
/// para que un `Fallo<String>` siga siendo un fallo cuando se espera
/// `Fallo<void>`.
sealed class Resultado<T> {
  const Resultado();
  T? get valor => switch (this) {
    Ok<T>(:final valor) => valor,
    Fallo<T>() => null,
  };
  String? get mensaje => switch (this) {
    Ok<T>() => null,
    Fallo<T>(:final mensaje) => mensaje,
  };
  bool get esError => mensaje != null;
}

class Ok<T> extends Resultado<T> {
  @override
  final T valor;
  const Ok(this.valor);
}

class Fallo<T> extends Resultado<T> {
  @override
  final String mensaje;
  const Fallo(this.mensaje);
}
