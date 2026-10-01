/**
 * The school's paid options beside tuition: the cantine and the garde
 * d'enfants. Both follow the same rules (`canteen.ts`) and screens — enrolled
 * pupils pay by the month, by package or for the year — and differ only by
 * their words, their address and who may enrol. Pure: shared by the server and
 * the device.
 */

export const SERVICES = ["canteen", "daycare"] as const;
export type SchoolService = (typeof SERVICES)[number];

export function parseService(value: unknown): SchoolService {
  return value === "daycare" ? "daycare" : "canteen";
}

export type ServiceInfo = {
  service: SchoolService;
  /** Page title and sidebar entry: "Cantine", "Garde d'enfants". */
  title: string;
  /** In a sentence, after an article: "cantine", "garde". */
  noun: string;
  /** "la cantine", "la garde". */
  the: string;
  /** A month the pupil does not come: "sans cantine". */
  without: string;
  /** What enrolled pupils do there, for the stats: "mangent à la cantine". */
  enrolledHint: string;
  /** The app's address for it. */
  path: string;
  /** The class levels whose pupils may enrol; null: every level. */
  levels: readonly string[] | null;
  /** What the receipt is headed by: "CANTINE". */
  receiptWord: string;
};

export const SERVICE_INFO: Record<SchoolService, ServiceInfo> = {
  canteen: {
    service: "canteen",
    title: "Cantine",
    noun: "cantine",
    the: "la cantine",
    without: "sans cantine",
    enrolledHint: "mangent à la cantine",
    path: "/cantine",
    levels: null,
    receiptWord: "CANTINE",
  },
  daycare: {
    service: "daycare",
    title: "Garde d'enfants",
    noun: "garde",
    the: "la garde",
    without: "sans garde",
    enrolledHint: "gardés par l'école",
    path: "/garde",
    levels: ["Maternelle", "Primaire"],
    receiptWord: "GARDE D'ENFANTS",
  },
};

export function serviceInfo(service: SchoolService | null | undefined) {
  return SERVICE_INFO[service ?? "canteen"];
}

/** Whether a pupil of this class level may be enrolled in the service. */
export function levelAllowed(service: SchoolService, level: string | null | undefined) {
  const levels = SERVICE_INFO[service].levels;
  return !levels || (level != null && levels.includes(level));
}

/**
 * Whether the garde is offered at signup for this type of school. Afterwards
 * any school can still turn it on from the Options page.
 */
export function daycareOffered(schoolType: string | null | undefined) {
  return schoolType === "Maternelle et primaire" || schoolType === "Primaire";
}

/** "Réservée aux élèves de maternelle et du primaire." — null when open to all. */
export function levelsNotice(service: SchoolService) {
  return SERVICE_INFO[service].levels ? "Réservée aux élèves de maternelle et du primaire." : null;
}
