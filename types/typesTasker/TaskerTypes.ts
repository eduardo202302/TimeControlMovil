/**
 * Forma de los datos de Tasker tal como los devuelve hoy su API (vista de
 * seguimiento de un ticket abierto). El puente de face-class-api debe
 * devolver esta misma forma para que las pantallas no cambien al conectar.
 */

export interface TaskerUserRef {
  id: number;
  name: string;
}

export interface TaskerClient {
  id: number;
  name: string;
  phone: string;
}

export interface TaskerState {
  id: number;
  name: string;
  /** Hex "#RRGGBB" configurado en Tasker; puede faltar o venir mal formado. */
  color: string;
}

export interface TaskerTag {
  id: number;
  name: string;
  category: { name: string };
}

export interface TaskerAddress {
  title: string;
  province: string;
  city: string;
  sector: string;
  zone: string;
  street: string;
  streetNumber: string;
  building: string;
  apartmentNumber: string;
  latitude: number | string | null;
  longitude: number | string | null;
  referenceToArrive: string;
  whoReceives: string;
  restrictions: string;
  // Lo que agrega la ventana "Seleccionar Ubicación" de Reportar Avería; el
  // ticket abierto de Seguimiento no los trae.
  id?: number;
  order?: number;
  selected?: boolean;
  postalCode?: string;
  /** formatTaskerAddress del borrador ("Calle Número, Zona, …"). */
  formattedAddress?: string;
  /** formatted_address del último resultado de Google. */
  address?: string;
  location?: { lat: number; lng: number };
}

/**
 * Dirección de la lista de Reportar: siempre con id, order y selected.
 * `locked`: es la predeterminada del cliente (se elige, no se edita ni se
 * borra). `fromClient`: vino del cliente (false = la agregó el usuario). Las
 * del cliente que no son la predeterminada se editan y borran como las
 * agregadas, pero solo en este reporte: nada se guarda en el cliente.
 */
export type TaskerReportAddress = TaskerAddress & {
  id: number;
  order: number;
  selected: boolean;
  locked: boolean;
  fromClient: boolean;
};

/**
 * Dirección registrada de un cliente de Tasker. `isDefault`: la predeterminada
 * (una sola; sin ninguna marcada, lo es la primera).
 */
export type TaskerClientAddress = TaskerAddress & { id: number; isDefault?: boolean };

/**
 * Config de Tasker de la compañía activa (ver getTaskerCompanyConfig). Los
 * labels llevan los nombres de company.settings de Tasker.
 */
export interface TaskerCompanyConfig {
  /** "Conectar Tasker" de la compañía en face-class (nombre real por confirmar). */
  connected: boolean;
  /**
   * true = el reporte lleva averías (obligatorias) y la descripción es
   * opcional (nombre real por confirmar).
   */
  appliesFault: boolean;
  /** Título de la opción y la pantalla; null o vacío → "Reportar Servicio". */
  failureReportMenuLabel: string | null;
  /** Título del bloque de averías; null o vacío → "Averías". */
  failureReportLabel: string | null;
  /** Título de la tarjeta del cliente; null o vacío → "Cliente". Provisional. */
  clientLabel: string | null;
}

/** Cliente asignado al usuario en Tasker. */
export interface TaskerUserClient {
  id: number;
  name: string;
  /** Categoría del cliente: filtra las averías. null = ve todas. */
  categoryId: number | null;
  addresses: TaskerClientAddress[];
}

/** Avería del catálogo (acción de la tarea en Tasker). */
export interface TaskerFaultAction {
  id: number;
  name: string;
  /** null = aplica a cualquier cliente. */
  categoryId: number | null;
}

/** Borrador de la ventana "Seleccionar Ubicación": todo texto. */
export interface TaskerAddressDraft {
  title: string;
  province: string;
  city: string;
  sector: string;
  zone: string;
  street: string;
  streetNumber: string;
  building: string;
  apartmentNumber: string;
  referenceToArrive: string;
  whoReceives: string;
  restrictions: string;
  /** Sin campo visible: solo lo llena Google. */
  postalCode: string;
}

/** Campos opcionales de la ventana de dirección según la compañía. */
export interface TaskerAddressConfig {
  showWhoReceives: boolean;
  showRestrictions: boolean;
}

/** Autor de un comentario. Tasker hoy no devuelve el id (ver canEditTaskerComment). */
export interface TaskerCommentAuthor {
  id?: number | null;
  name: string;
}

export interface TaskerComment {
  id: number;
  addUser: TaskerCommentAuthor;
  createdDate: string;
  comment: string;
  /**
   * Adjuntos del comentario: rutas guardadas en el servidor o, en un
   * comentario recién agregado en local, data-URIs.
   */
  images: string[];
  /** Creado en este dispositivo y todavía sin enviar. */
  isLocal?: boolean;
}

/** Lo que devuelve la ventana "Agregar / Editar comentario". */
export interface TaskerCommentDraft {
  text: string;
  /**
   * Adjuntos nuevos y, al editar, los que ya tenía el comentario (ver
   * commentImagesToAttachments). Al guardar se manda `dataUri` de cada uno.
   */
  attachments: TaskerAttachment[];
}

/** Cuerpo de "Agregar comentario" de Tasker (buildCommentPayload). */
export interface TaskerCommentPayload {
  taskComments: {
    comment: string;
    images: string[];
    localAttachments: never[];
  }[];
}

export interface TaskerCoordinates {
  latitude: number;
  longitude: number;
}

export interface TaskerActivity {
  id: number;
  /** "state" = cambio de estado; hay otros tipos (p. ej. "assignedUser"). */
  type: string;
  action: string;
  message: string;
  beginDate: string;
  endDate: string | null;
  user: { name: string };
  /** Duración ya calculada por Tasker ("1d 1h 8m 4s"); null si sigue abierta. */
  time: string | null;
  coordinates: TaskerCoordinates | null;
}

export interface TaskerTask {
  id: number;
  createdDate: string;
  /** Descripción de la avería. */
  action: string;
  stateId: number;
  addUser: TaskerUserRef;
  assignedUser: TaskerUserRef | null;
  client: TaskerClient;
  state: TaskerState;
  tags: TaskerTag[];
  address: TaskerAddress | null;
  comments: TaskerComment[];
  activities: TaskerActivity[];
}

export interface TaskerSettings {
  companyName: string;
}

export interface TaskerOpenTaskResponse {
  task: TaskerTask;
  settings: TaskerSettings;
}

/** Qué pide el formulario de Reportar según la compañía (getTaskerFormRules). */
export interface TaskerFormRules {
  showFaults: boolean;
  faultsRequired: boolean;
  descriptionRequired: boolean;
}

/**
 * Adjunto local de un comentario (Reportar Avería y Seguimiento), todavía sin
 * subir. Tasker acepta solo imágenes (comprimidas a JPEG) y PDF.
 */
export interface TaskerAttachment {
  id: string;
  name: string;
  mimeType: string;
  /** "data:<mime>;base64,…": lo que se manda tal cual en `images`. */
  dataUri: string;
  size?: number;
}

export interface TaskerReportErrors {
  faults?: string;
  description?: string;
  address?: string;
}
