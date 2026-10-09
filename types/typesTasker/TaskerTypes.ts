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
}

export interface TaskerComment {
  id: number;
  addUser: { name: string };
  createdDate: string;
  comment: string;
  /** Rutas de los adjuntos del comentario. */
  images: string[];
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

/** Tipo de servicio elegible al reportar una avería. */
export interface TaskerTypeTag {
  id: number;
  name: string;
  color?: string;
}

export interface TaskerReportConfig {
  serviceNameLabel: string;
  isDescriptionRequired: boolean;
}

/** Adjunto local del formulario de reporte (todavía sin subir). */
export interface TaskerReportAttachment {
  id: number;
  name: string;
  kind: "image" | "pdf";
}

/** Datos de solo lectura que acompañan el formulario de reporte. */
export interface TaskerReportContext {
  client: TaskerClient & { typeName: string };
  reporter: TaskerUserRef;
  addresses: TaskerAddress[];
  attachments: TaskerReportAttachment[];
}

export interface TaskerReportErrors {
  typeId?: string;
  description?: string;
}
