"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PaymentModalProvider } from "@/components/payment-modal-context";
import { StudentsListView } from "@/components/students-list-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { ClassesView } from "@/components/views/classes-view";
import { StudentDetailView } from "@/components/views/student-detail-view";
import { LateView } from "@/components/views/late-view";
import { PaymentsView } from "@/components/views/payments-view";
import { NewStudentForm } from "@/app/(app)/eleves/nouveau/new-student-form";
import { EditStudentForm } from "@/app/(app)/eleves/[studentId]/modifier/edit-student-form";
import { ImportForm } from "@/app/(app)/classes/[classId]/eleves/importer/import-form";
import { ClassConfigSummary } from "@/components/views/class-config-summary";
import { useOnlineStatus } from "@/components/offline-status";
import { useLocalData, refreshIfStale } from "@/lib/offline-mirror";
import { assumeUnreachable } from "@/lib/connectivity";
import type { MirrorData } from "@/lib/offline-data";
import {
  classesOverview,
  dashboardData,
  lateStudents,
  paymentsOverview,
  sidebarCounts,
  studentDetail,
  studentsList,
} from "@/lib/offline-queries";
import { nextMatricule } from "@/lib/matricule";
import { formatDateTime } from "@/lib/format";
import type { LateRow } from "@/components/late-table";
import type { StudentSummary } from "@/lib/tuition";

/**
 * The whole application, rendered from the copy of the school kept on the
 * device.
 *
 * The service worker serves this document for any app page requested without a
 * network, whatever its URL — including pages this device has never opened. So
 * this component reads the address itself, renders the matching screen from
 * IndexedDB, and turns every link into a local navigation: offline, Bangre
 * behaves like an app that happens to have its data already.
 */
export function OfflineApp() {
  const { data, loading, syncedAt } = useLocalData();
  const online = useOnlineStatus();

  // Null until mounted: the server has no address bar, and rendering the same
  // empty frame on both sides is what keeps hydration honest.
  const [href, setHref] = useState<string | null>(null);

  // This document is only served when a page could not be loaded from the
  // server: treat the server as unreachable — every link stays local, every
  // form goes to the outbox at once — until a probe proves it is back. Before,
  // a wifi with no internet counted as "online" here, and each click waited
  // on the server again.
  useEffect(() => {
    assumeUnreachable();
  }, []);

  useEffect(() => {
    const current = () => `${window.location.pathname}${window.location.search}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHref(current());
    const onPopState = () => setHref(current());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // A connection may come back while this shell is on screen (the user walks
  // back into wifi). Pull a fresh copy so the figures stop aging.
  useEffect(() => {
    if (online) void refreshIfStale();
  }, [online]);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setHref(to);
    window.scrollTo(0, 0);
  }, []);

  /**
   * Offline, every link inside the shell navigates locally: captured before the
   * router and before the browser, since a real navigation would only come back
   * through the service worker to this same shell. Once the network is back the
   * clicks are left alone, so the next page comes from the server.
   */
  const onClickCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (online) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;

      const url = anchor.getAttribute("href");
      if (!url || !url.startsWith("/") || url.startsWith("//")) return;

      event.preventDefault();
      event.stopPropagation();
      navigate(url);
    },
    [navigate, online]
  );

  if (href === null || loading) return <Frame />;
  if (!data) return <NoLocalCopy online={online} />;

  const url = new URL(href, "http://local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const counts = sidebarCounts(data);

  // The capture wraps the sidebar too: its links used to escape it, and each
  // click there reloaded the whole offline app through the service worker.
  return (
    <PaymentModalProvider>
      <div className="contents" onClickCapture={onClickCapture}>
        <AppShell
          schoolName={data.school.name}
          academicYearLabel={data.academicYear?.label ?? ""}
          contactInitials={initialsOf(data.school.contactName)}
          contactName={data.school.contactName}
          counts={counts}
          activePath={path}
        >
          <ConnectivityBanner online={online} syncedAt={syncedAt} />
          <Screen data={data} path={path} params={url.searchParams} navigate={navigate} />
        </AppShell>
      </div>
    </PaymentModalProvider>
  );
}

function initialsOf(contactName: string) {
  return contactName
    .split(" ")
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ConnectivityBanner({ online, syncedAt }: { online: boolean; syncedAt: Date | null }) {
  if (online) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-(--color-success-border) bg-(--color-success-bg-soft) px-4 lg:px-7 py-2.5">
        <span className="text-[13px] font-semibold text-(--color-success-text-dark)">Connexion revenue</span>
        <span className="text-[12.5px] text-(--color-text-secondary)">
          Cet écran affiche encore la copie locale.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="ml-auto h-8 rounded-lg border border-(--color-border-strong) bg-white px-3 text-[12.5px] font-semibold cursor-pointer"
        >
          Revenir à la version en ligne
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-(--color-gold-border) bg-(--color-gold-bg) px-4 lg:px-7 py-2.5">
      <span className="w-2 h-2 rounded-full bg-(--color-gold-dot) shrink-0" />
      <span className="text-[13px] font-semibold text-(--color-gold-text)">Hors ligne</span>
      <span className="text-[12.5px] text-(--color-text-secondary)">
        Données de cet appareil{syncedAt ? ` · mises à jour le ${formatDateTime(syncedAt)}` : ""}. Vos saisies partent
        au retour du réseau.
      </span>
    </div>
  );
}

function Screen({
  data,
  path,
  params,
  navigate,
}: {
  data: MirrorData;
  path: string;
  params: URLSearchParams;
  navigate: (href: string) => void;
}) {
  const q = params.get("q") ?? undefined;
  const statut = (params.get("statut") ?? undefined) as StudentSummary["status"] | undefined;
  const page = Number(params.get("page") ?? "1") || 1;
  const segments = path.split("/").filter(Boolean);

  // The offline entry points (/, /hors-ligne) and the dashboard all land here.
  if (path === "/" || path === "/hors-ligne" || path === "/tableau-de-bord") {
    return <DashboardView data={dashboardData(data)} yearLabel={data.academicYear?.label ?? ""} />;
  }

  if (path === "/classes") {
    return (
      <ClassesView overview={classesOverview(data)} q={q} niveau={params.get("niveau") ?? undefined} offline />
    );
  }

  // /classes/:classId/eleves/importer — the file is read on the device, the
  // students go to the outbox.
  if (segments[0] === "classes" && segments[2] === "eleves" && segments[3] === "importer") {
    const clazz = data.classes.find((c) => c.id === segments[1]);
    if (!clazz) return <NotInLocalCopy what="Cette classe" />;
    return <ImportForm classId={clazz.id} className={clazz.name} onNavigate={navigate} />;
  }

  // /classes/:classId/configuration — readable offline, changed online.
  if (segments[0] === "classes" && segments[2] === "configuration") {
    const clazz = data.classes.find((c) => c.id === segments[1]);
    if (!clazz) return <NotInLocalCopy what="Cette classe" />;
    const studentCount = data.students.filter((s) => s.classId === clazz.id && s.status === "active").length;
    return <ClassConfigSummary clazz={clazz} studentCount={studentCount} />;
  }

  // /classes/:classId/eleves
  if (segments[0] === "classes" && segments[2] === "eleves") {
    const clazz = data.classes.find((c) => c.id === segments[1]);
    if (!clazz) return <NotInLocalCopy what="Cette classe" />;
    const result = studentsList(data, { classId: clazz.id, q, statut, page });
    return (
      <StudentsListView
        eyebrow={
          <>
            <Link href="/classes" className="text-(--color-primary) font-medium">
              Classes
            </Link>{" "}
            › {clazz.name}
          </>
        }
        title={
          <>
            Élèves de la {clazz.name}{" "}
            <span className="text-[14px] text-(--color-text-muted) font-normal">· {result.total} élèves</span>
          </>
        }
        basePath={`/classes/${clazz.id}/eleves`}
        result={result}
        q={q}
        statut={statut}
        showClassColumn={false}
        offline
        onNavigate={navigate}
        extraActions={
          <>
            <Link
              href={`/classes/${clazz.id}/eleves/importer`}
              className="h-[38px] rounded-[9px] border border-(--color-border-strong) bg-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              Importer une liste
            </Link>
            <Link
              href={`/eleves/nouveau?classId=${clazz.id}`}
              className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
            >
              + Ajouter un élève
            </Link>
          </>
        }
      />
    );
  }

  if (path === "/eleves") {
    const result = studentsList(data, { q, statut, page });
    return (
      <StudentsListView
        title="Élèves"
        subtitle={`${result.total} élèves actifs`}
        basePath="/eleves"
        result={result}
        q={q}
        statut={statut}
        showClassColumn
        offline
        onNavigate={navigate}
        classOptions={data.classes.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name }))}
        extraActions={
          <Link
            href="/eleves/nouveau"
            className="h-[38px] rounded-[9px] bg-(--color-primary) text-white flex items-center px-4 text-[13.5px] font-semibold no-underline hover:no-underline"
          >
            + Ajouter un élève
          </Link>
        }
      />
    );
  }

  if (path === "/eleves/nouveau") {
    const classes = data.classes.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name }));
    return (
      <NewStudentForm
        classes={classes}
        defaultClassId={params.get("classId") ?? undefined}
        suggestedMatricule={nextMatricule(data.students.map((s) => s.matricule))}
      />
    );
  }

  // /eleves/:studentId and /eleves/:studentId/modifier
  if (segments[0] === "eleves" && segments[1]) {
    const studentId = segments[1];
    if (segments[2] === "modifier") {
      const student = data.students.find((s) => s.id === studentId);
      if (!student) return <NotInLocalCopy what="Cette fiche élève" />;
      return <EditStudentForm student={student} />;
    }
    const detail = studentDetail(data, studentId);
    if (!detail) return <NotInLocalCopy what="Cette fiche élève" />;
    return <StudentDetailView data={detail} offline />;
  }

  if (path === "/retards") {
    const classe = params.get("classe") ?? undefined;
    const jours = params.get("jours") ?? undefined;
    const whatsapp = params.get("whatsapp") ?? undefined;
    const late = lateStudents(data, {
      classId: classe,
      minDays: jours ? Number(jours) : undefined,
      whatsapp: whatsapp === "injoignable" || whatsapp === "reachable" ? whatsapp : undefined,
    });

    const rows: LateRow[] = late.rows.map((r) => ({
      id: r.student.id,
      matricule: r.student.matricule,
      lastName: r.student.lastName,
      firstName: r.student.firstName,
      className: r.student.class.name,
      parentName: r.student.parentName,
      parentPhone: r.student.parentPhone,
      whatsappStatus: r.student.whatsappStatus,
      overdueLabel: `${r.summary.overdueTranches.map((t) => t.tranche.label).join(" + ")} · ${Math.max(
        ...r.summary.overdueTranches.map((t) => t.daysLate)
      )} j`,
      overdueAmount: r.summary.overdueAmount,
      lastReminder: r.lastReminder ? { sentAt: r.lastReminder.sentAt, status: r.lastReminder.status } : null,
    }));

    return (
      <LateView
        rows={rows}
        classes={data.classes.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name }))}
        filters={{ classe, jours, whatsapp }}
        reachableStudents={late.rows
          .filter((r) => r.student.whatsappStatus === "reachable")
          .map((r) => ({ id: r.student.id, label: `${r.student.lastName} ${r.student.firstName}` }))}
        reachableCount={late.reachableCount}
        totalDue={late.totalDue}
        offline
        onNavigate={navigate}
      />
    );
  }

  if (path === "/paiements") {
    return <PaymentsView data={paymentsOverview(data, page)} offline />;
  }

  return <OnlineOnly path={path} />;
}

/** The empty frame rendered on the server and for the first paint. */
function Frame() {
  return (
    <div className="min-h-screen bg-(--color-bg-app) flex items-center justify-center px-5">
      <div className="text-[13.5px] text-(--color-text-muted)">Chargement des données de cet appareil…</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-(--color-bg-page) flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[460px] bg-white border border-(--color-border) rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-(--color-gold-dot)" />
          <span className="text-[13px] font-semibold text-(--color-gold-text)">Hors ligne</span>
        </div>
        <div className="text-[19px] font-semibold tracking-tight mt-3">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** No snapshot has ever been downloaded on this device. */
function NoLocalCopy({ online }: { online: boolean }) {
  return (
    <Panel title="Aucune donnée sur cet appareil">
      <p className="text-[13.5px] text-(--color-text-secondary) leading-relaxed mt-2.5">
        Bangre copie les classes, les élèves et les paiements sur l&apos;appareil à chaque connexion, pour pouvoir
        tout afficher sans réseau. Cette copie n&apos;a pas encore été faite ici : connectez-vous une fois au réseau,
        ouvrez Bangre, et tout restera ensuite disponible hors ligne.
      </p>
      <div className="rounded-[11px] border border-(--color-success-border) bg-(--color-success-bg-soft) px-4 py-3 mt-4">
        <div className="text-[13px] font-semibold text-(--color-success-text-dark)">Vos saisies ne sont pas perdues</div>
        <p className="text-[12.5px] text-(--color-text-secondary) leading-relaxed mt-1">
          Les paiements et fiches élèves enregistrés sans réseau restent sur cet appareil et partent automatiquement
          dès le retour de la connexion.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="w-full h-[42px] rounded-[10px] bg-(--color-primary) text-white text-[13.5px] font-semibold mt-5 cursor-pointer"
      >
        {online ? "Réessayer maintenant" : "Réessayer"}
      </button>
    </Panel>
  );
}

function NotInLocalCopy({ what }: { what: string }) {
  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-[460px] rounded-2xl border border-(--color-gold-border) bg-(--color-gold-bg) p-5">
        <div className="text-[15px] font-semibold text-(--color-gold-text)">{what} n&apos;est pas sur cet appareil</div>
        <p className="text-[13px] text-(--color-text-secondary) leading-relaxed mt-1.5">
          Elle a probablement été créée sur un autre poste depuis la dernière synchronisation. Elle apparaîtra dès la
          prochaine connexion au réseau.
        </p>
        <Link href="/tableau-de-bord" className="text-[13px] font-semibold text-(--color-primary) mt-3 inline-block">
          Retour au tableau de bord →
        </Link>
      </div>
    </div>
  );
}

/**
 * The few screens that change the school's structure for everyone at once —
 * creating a class, the year-end promotion, the subscription — or produce a
 * server document. Done offline on one computer, they would clash with what
 * the others do meanwhile, so they wait for the network and say so.
 */
function OnlineOnly({ path }: { path: string }) {
  const reason = path.startsWith("/passage-annee")
    ? "Le passage d'année transforme toutes les classes de l'établissement d'un coup : il se fait en ligne, pour que tous les postes partent de la même année."
    : path.startsWith("/classes/nouvelle")
      ? "Une nouvelle classe se crée en ligne : ses tranches servent ensuite à tous les encaissements, sur tous les postes."
      : path.startsWith("/abonnement") || path.startsWith("/compte")
        ? "L'abonnement se gère en ligne."
        : "Cette page est préparée par le serveur.";

  return (
    <div className="p-4 lg:p-8">
      <div className="max-w-[480px] rounded-2xl border border-(--color-border) bg-white p-5">
        <div className="text-[15px] font-semibold">Disponible au retour du réseau</div>
        <p className="text-[13px] text-(--color-text-secondary) leading-relaxed mt-1.5">{reason}</p>
        <p className="text-[13px] text-(--color-text-secondary) leading-relaxed mt-2">
          Tout le reste fonctionne sans réseau : tableau de bord, classes, élèves (ajout, modification, import de
          liste), encaissements, retards, rappels WhatsApp et journal des paiements.
        </p>
        <Link href="/tableau-de-bord" className="text-[13px] font-semibold text-(--color-primary) mt-3 inline-block">
          Retour au tableau de bord →
        </Link>
      </div>
    </div>
  );
}
