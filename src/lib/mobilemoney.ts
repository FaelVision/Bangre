import "server-only";

export type MobileMoneyProvider = "orange_money" | "moov_money";

export type MobileMoneyChargeResult = {
  ok: boolean;
  mode: "live" | "mock";
  reference?: string;
  error?: string;
};

function isConfigured(provider: MobileMoneyProvider) {
  if (provider === "orange_money") {
    return Boolean(process.env.ORANGE_MONEY_API_KEY && process.env.ORANGE_MONEY_MERCHANT_ID);
  }
  return Boolean(process.env.MOOV_MONEY_API_KEY && process.env.MOOV_MONEY_MERCHANT_ID);
}

/**
 * Initiates a Mobile Money charge (USSD push) for the Bangre subscription.
 *
 * Orange Money / Moov Money merchant APIs require a signed business
 * agreement per operator, so there is no generic public sandbox to call
 * here. Without merchant credentials configured, this simulates the USSD
 * approval flow (auto-succeeds after a short delay) so the subscription
 * flow works end-to-end in development. Plug real credentials + the
 * operator's charge endpoint in the `live` branch for production.
 */
export async function chargeMobileMoney(
  provider: MobileMoneyProvider,
  phoneE164: string,
  amountCFA: number
): Promise<MobileMoneyChargeResult> {
  if (!isConfigured(provider)) {
    console.log(
      `[mobilemoney:mock] provider=${provider} phone=${phoneE164} amount=${amountCFA} CFA — auto-approved`
    );
    return { ok: true, mode: "mock", reference: `MOCK-${provider.toUpperCase()}-${Date.now()}` };
  }

  // Real integration point: call the operator's merchant API here, e.g.
  //   Orange Money: POST /webpayment (client_id/secret -> OAuth token -> charge)
  //   Moov Money:   POST /transaction (merchant API key -> charge)
  // Both require a merchant account, callback/webhook URL, and a signed
  // agreement with the operator before they issue production credentials.
  return {
    ok: false,
    mode: "live",
    error: `Intégration ${provider} non implémentée — configurez l'endpoint de l'opérateur.`,
  };
}
