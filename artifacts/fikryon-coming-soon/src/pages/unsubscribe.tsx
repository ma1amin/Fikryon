import { useState } from "react";
import { unsubscribe } from "@workspace/api-client-react";
import { usePreferences } from "@/hooks/use-preferences";

export default function Unsubscribe() {
  const { lang } = usePreferences();
  const ar = lang === "ar";
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const valid = /^[a-f0-9]{64}$/.test(token);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function confirm() {
    if (!valid || status === "sending") return;
    setStatus("sending");
    try { await unsubscribe({ token }); setStatus("done"); }
    catch { setStatus("error"); }
  }
  return <main className="fk-page flex items-center justify-center p-6">
    <section className="fk-glass max-w-lg p-8 text-center">
      <h1 className="text-2xl font-semibold mb-4">{ar ? "إلغاء الاشتراك" : "Unsubscribe"}</h1>
      {!valid ? <p role="alert">{ar ? "رابط إلغاء الاشتراك غير صالح." : "This unsubscribe link is invalid."}</p>
        : status === "done" ? <p role="status">{ar ? "تم إلغاء اشتراكك. لن نرسل لك رسائل الإطلاق." : "You've unsubscribed. You won't receive launch emails."}</p>
        : <>
          <p className="mb-6">{ar ? "هل تريد إلغاء الاشتراك في إشعارات إطلاق فيكريون؟" : "Would you like to stop receiving FIKRYON launch notifications?"}</p>
          <button type="button" className="fk-cta mx-auto" onClick={confirm} disabled={status === "sending"}>
            {status === "sending" ? (ar ? "جارٍ الإلغاء" : "Unsubscribing") : (ar ? "تأكيد إلغاء الاشتراك" : "Confirm unsubscribe")}
          </button>
          {status === "error" && <p role="alert" className="mt-4">{ar ? "تعذّر إلغاء الاشتراك. حاول مرة أخرى." : "Unable to unsubscribe. Please try again."}</p>}
        </>}
    </section>
  </main>;
}
