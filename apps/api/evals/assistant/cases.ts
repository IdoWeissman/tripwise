/**
 * Retrieval cases for the trip assistant. All data is invented (see fixture.ts).
 * `expect` lists chunk titles; a case passes at k when any of them is in the top k.
 * `tags` group results: exact (codes, names), paraphrase (different words), document
 * (only in an uploaded file's text), hebrew (question in Hebrew, data in English).
 */
export interface RetrievalCase {
  id: string;
  question: string;
  expect: string[];
  tags: ('exact' | 'paraphrase' | 'document' | 'hebrew' | 'money')[];
}

export const CASES: RetrievalCase[] = [
  { id: 'flight-code', question: 'TP 1357', expect: ['Tel Aviv ⇄ Lisbon'], tags: ['exact'] },
  {
    id: 'flight-time',
    question: 'What time does our flight leave?',
    expect: ['Tel Aviv ⇄ Lisbon'],
    tags: ['paraphrase'],
  },
  {
    id: 'sleep',
    question: 'Where are we sleeping?',
    expect: ['Casa Inventada, Alfama', 'casa-inventada.eml'],
    tags: ['paraphrase'],
  },
  {
    id: 'checkout',
    question: 'When do we have to leave the apartment on the last day?',
    expect: ['Casa Inventada, Alfama', 'casa-inventada.eml'],
    tags: ['paraphrase'],
  },
  {
    id: 'key-box',
    question: 'What is the key box code?',
    expect: ['casa-inventada.eml'],
    tags: ['document', 'exact'],
  },
  {
    id: 'door-code',
    question: 'how do we get into the flat when we arrive',
    expect: ['casa-inventada.eml'],
    tags: ['document', 'paraphrase'],
  },
  {
    id: 'baggage',
    question: 'How many kilos of luggage can I bring?',
    expect: ['tap-booking.pdf'],
    tags: ['document', 'paraphrase'],
  },
  {
    id: 'dress-code',
    question: 'Is there a dress code for the fado show?',
    expect: ['fado-tickets.eml'],
    tags: ['document'],
  },
  {
    id: 'taxi',
    question: 'Who paid for the taxi from the airport?',
    expect: ['Airport taxi'],
    tags: ['money', 'exact'],
  },
  {
    id: 'groceries',
    question: 'How much did we spend on food shopping?',
    expect: ['Groceries', 'Pastelaria + market run'],
    tags: ['money', 'paraphrase'],
  },
  {
    id: 'sintra',
    question: "What's the plan in Sintra?",
    expect: ['Sintra day trip', 'Pena Palace'],
    tags: ['exact'],
  },
  {
    id: 'surf',
    question: 'Any ideas for the beach or surfing?',
    expect: ['Surf lesson in Ericeira'],
    tags: ['exact'],
  },
  {
    id: 'boat',
    question: 'boat trip at sunset',
    expect: ['Sunset sail on the Tagus'],
    tags: ['paraphrase'],
  },
  {
    id: 'castle',
    question: 'old tram up to the castle',
    expect: ['Tram 28 + Castelo de São Jorge'],
    tags: ['paraphrase'],
  },
  {
    id: 'restaurant',
    question: 'Where is dinner on the first night?',
    expect: ['Taberna Inventada', 'Dinner at Taberna Inventada'],
    tags: ['paraphrase'],
  },
  { id: 'he-flight', question: 'מתי הטיסה שלנו?', expect: ['Tel Aviv ⇄ Lisbon'], tags: ['hebrew'] },
  {
    id: 'he-key',
    question: 'מה הקוד של תיבת המפתחות?',
    expect: ['casa-inventada.eml'],
    tags: ['hebrew', 'document'],
  },
  {
    id: 'he-hotel',
    question: 'איפה אנחנו ישנים?',
    expect: ['Casa Inventada, Alfama', 'casa-inventada.eml'],
    tags: ['hebrew'],
  },
];
