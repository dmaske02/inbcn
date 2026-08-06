import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expected = {
  en: { top: "Top", india: "India", liveTv: "Live TV", search: "Search stories, sources, cities", notifications: "Notifications {count}", report: "Report incident" },
  hi: { top: "प्रमुख", india: "भारत", liveTv: "लाइव टीवी", search: "समाचार, स्रोत, शहर खोजें", notifications: "सूचनाएँ {count}", report: "घटना रिपोर्ट करें" },
  mr: { top: "प्रमुख", india: "भारत", liveTv: "थेट टीव्ही", search: "बातम्या, स्रोत, शहरे शोधा", notifications: "सूचना {count}", report: "घटना नोंदवा" },
};

for (const [locale, labels] of Object.entries(expected)) {
  test(`${locale} provides localized public chrome labels`, async () => {
    const messages = JSON.parse(
      await readFile(new URL(`../../../../messages/${locale}.json`, import.meta.url), "utf8"),
    );
    assert.ok(messages.publicChrome, "missing publicChrome translations");
    assert.equal(messages.publicChrome.navigation.top, labels.top);
    assert.equal(messages.publicChrome.navigation.india, labels.india);
    assert.equal(messages.publicChrome.actions.liveTv, labels.liveTv);
    assert.equal(messages.publicChrome.actions.searchPlaceholder, labels.search);
    assert.equal(messages.publicChrome.utility.notifications, labels.notifications);
    assert.equal(messages.publicChrome.utility.reportIncident, labels.report);
  });
}
