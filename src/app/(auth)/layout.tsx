import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-(--color-bg-page) flex justify-center">
      <div className="w-full min-h-screen flex bg-(--color-bg-app)">
        <div className="w-[42%] min-w-[420px] hidden md:flex flex-col justify-between bg-linear-to-b from-[#0B5E2F] to-[#083A20] text-[#F7EFE4] px-13 py-14">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/logo-bangre.jpg"
                alt="Bangre"
                width={52}
                height={52}
                priority
                // The source is 1024×559: without `shrink-0` the flex row
                // narrows the box while the height stays 52px, squashing it.
                className="rounded-full object-cover bg-white shrink-0"
              />
              <div className="text-[21px] font-semibold tracking-tight">Bangre</div>
            </div>
            <div className="font-serif-display text-[44px] leading-[1.1] mt-16 max-w-[14em]">
              La scolarité de votre établissement, claire et à jour.
            </div>
            <div className="text-[15px] leading-relaxed text-[#F7EFE4]/72 mt-5 max-w-[30em]">
              Classes, tranches de paiement, reçus et rappels WhatsApp aux parents — même sans
              connexion internet.
            </div>
            <div className="grid gap-3.5 mt-10 max-w-[26em]">
              {[
                "Suivi des paiements par tranches, élève par élève",
                "Rappels automatiques aux parents sur WhatsApp",
                "Reçus PDF numérotés, imprimables au guichet",
              ].map((line) => (
                <div key={line} className="flex gap-3 items-start">
                  <div className="w-5 h-5 rounded-md bg-[#D8B45C]/22 text-[#D8B45C] flex items-center justify-center text-xs shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div className="text-sm leading-relaxed">{line}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[13px] text-[#F7EFE4]/55">
            5 000 CFA / mois ou 55 000 CFA / an par établissement · paiement Mobile Money
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 sm:px-10 py-10 sm:py-12">
          <div className="w-full max-w-[452px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
