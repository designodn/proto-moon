const PREPOSITION_CASES = new Map([
  ['с', 'instrumental'], ['со', 'instrumental'], ['перед', 'instrumental'],
  ['над', 'instrumental'], ['под', 'instrumental'], ['между', 'instrumental'],
  ['к', 'dative'], ['ко', 'dative'],
  ['у', 'genitive'], ['без', 'genitive'], ['для', 'genitive'], ['от', 'genitive'],
  ['до', 'genitive'], ['из', 'genitive'], ['около', 'genitive'], ['возле', 'genitive'],
  ['о', 'prepositional'], ['об', 'prepositional'], ['обо', 'prepositional'], ['при', 'prepositional'],
  ['в', 'accusative'], ['во', 'accusative'], ['на', 'accusative'],
  ['за', 'accusative'], ['про', 'accusative'],
]);

// Контексты без предлога, где падеж N задаётся управляющим словом.
// Более специфичные фразы обрабатываются до общего nominative fallback.
const CONTEXT_CASES = [
  { pattern: /(^|[\s ])(Заметка)([\s ]+)N(?=$|[\s ,.!?—–-])/gi, grammaticalCase: 'genitive' },
  { pattern: /(^|[\s ])(Поздравьте)([\s ]+)N(?=$|[\s ,.!?—–-])/gi, grammaticalCase: 'accusative' },
];

// Род прошедшего времени в русском задаётся регулярно: мужской род на «-л»
// («-лся» у возвратных), женский на «-ла» («-лась»). Поэтому основной механизм —
// ПРАВИЛО, а списки ниже нужны только для того, что под правило не подходит.
// Раньше здесь был плоский список из девяти пар: любой глагол, которого в нём
// нет, молча проходил мимо согласования (в живых данных таких было девять).

// Формы, которые правило «-л/-ла» не выводит: краткие прилагательные и глаголы
// с чередованием основы. Применяются в любом месте текста — они однозначны.
const IRREGULAR_PAIRS = [
  ['активен', 'активна'], ['рад', 'рада'], ['готов', 'готова'],
  ['занят', 'занята'], ['согласен', 'согласна'], ['должен', 'должна'],
  ['уверен', 'уверена'], ['доволен', 'довольна'], ['болен', 'больна'],
  ['мог', 'могла'], ['шёл', 'шла'], ['ушёл', 'ушла'], ['пришёл', 'пришла'],
  ['нашёл', 'нашла'], ['нёс', 'несла'], ['вёл', 'вела'], ['лёг', 'легла'],
];

// Слова на «-л»/«-ла», которые глаголами НЕ являются: правило их не трогает,
// иначе «забил гол» у женщины превратится в «забила гола».
const NOT_A_VERB = new Set([
  'гол', 'пол', 'мел', 'стол', 'узел', 'угол', 'отдел', 'футбол', 'вокзал',
  'финал', 'канал', 'журнал', 'портал', 'сигнал', 'бокал', 'металл', 'квартал',
  'филиал', 'материал', 'сериал', 'пенал', 'бассейн', 'зал', 'котёл', 'орёл',
  'школа', 'сила', 'скала', 'пчела', 'метла', 'игла', 'стрела', 'смола',
  'зола', 'похвала', 'акула', 'формула', 'капсула', 'ветла', 'юла', 'скула',
]);

// Служебные слова, которые могут стоять ПЕРЕД сказуемым, не разрывая его:
// «снова активна — добавила момент».
const PREDICATE_LEAD = new Set([
  'снова', 'теперь', 'уже', 'впервые', 'недавно', 'сегодня', 'вчера',
  'также', 'тоже', 'ещё', 'еще', 'только', 'что', 'сейчас', 'и', 'а', 'но',
]);

const NON_PERSON_SUBJECT = /понравил(?:ся|ась|ось|ись)\s+(?:ваш|ваша|ваше|ваши)(?=\s|$|[,.!?])/i;

const keepCase = (source, result) => source[0] === source[0]?.toUpperCase()
  ? result[0].toUpperCase() + result.slice(1)
  : result;

function inflectWord(word, gender, grammaticalCase, isSurname) {
  if (!word || /(?:ко|их|ых|о|е|и|у)$/i.test(word)) return word;
  const female = gender === 'ж';
  const replace = (re, ending) => word.replace(re, ending);

  if (grammaticalCase === 'instrumental') {
    if (female) {
      if (isSurname && /(?:ова|ева|ина)$/i.test(word)) return replace(/а$/i, 'ой');
      if (/ая$/i.test(word)) return replace(/ая$/i, 'ой');
      if (/яя$/i.test(word)) return replace(/яя$/i, 'ей');
      if (/ия$/i.test(word)) return replace(/ия$/i, 'ией');
      if (/а$/i.test(word)) return replace(/а$/i, 'ой');
      if (/я$/i.test(word)) return replace(/я$/i, 'ей');
      if (/ь$/i.test(word)) return replace(/ь$/i, 'ью');
      return word;
    }
    if (isSurname && /(?:ский|цкий)$/i.test(word)) return replace(/ий$/i, 'им');
    if (/ий$/i.test(word)) return replace(/ий$/i, 'ием');
    if (/[йь]$/i.test(word)) return replace(/[йь]$/i, 'ем');
    if (/а$/i.test(word)) return replace(/а$/i, 'ой');
    if (/я$/i.test(word)) return replace(/я$/i, 'ей');
    if (/[бвгджзклмнпрстфхцчшщ]$/i.test(word)) return word + 'ом';
    return word;
  }

  if (grammaticalCase === 'dative') {
    if (female) {
      if (isSurname && /(?:ова|ева|ина)$/i.test(word)) return replace(/а$/i, 'ой');
      if (/ая$/i.test(word)) return replace(/ая$/i, 'ой');
      if (/яя$/i.test(word)) return replace(/яя$/i, 'ей');
      if (/ия$/i.test(word)) return replace(/ия$/i, 'ии');
      if (/[ая]$/i.test(word)) return replace(/[ая]$/i, 'е');
      if (/ь$/i.test(word)) return replace(/ь$/i, 'и');
      return word;
    }
    if (isSurname && /(?:ский|цкий)$/i.test(word)) return replace(/ий$/i, 'ому');
    if (/ий$/i.test(word)) return replace(/ий$/i, 'ию');
    if (/[йь]$/i.test(word)) return replace(/[йь]$/i, 'ю');
    if (/[ая]$/i.test(word)) return replace(/[ая]$/i, 'е');
    if (/[бвгджзклмнпрстфхцчшщ]$/i.test(word)) return word + 'у';
    return word;
  }

  if (grammaticalCase === 'genitive' || grammaticalCase === 'prepositional') {
    const prep = grammaticalCase === 'prepositional';
    if (female) {
      if (isSurname && /(?:ова|ева|ина)$/i.test(word)) return replace(/а$/i, 'ой');
      if (/ая$/i.test(word)) return replace(/ая$/i, 'ой');
      if (/яя$/i.test(word)) return replace(/яя$/i, 'ей');
      if (/ия$/i.test(word)) return replace(/ия$/i, 'ии');
      if (/а$/i.test(word)) return replace(/а$/i, prep ? 'е' : 'ы');
      if (/[яь]$/i.test(word)) return replace(/[яь]$/i, 'и');
      return word;
    }
    if (isSurname && /(?:ский|цкий)$/i.test(word)) return replace(/ий$/i, prep ? 'ом' : 'ого');
    if (/ий$/i.test(word)) return replace(/ий$/i, prep ? 'ии' : 'ия');
    if (/[йь]$/i.test(word)) return replace(/[йь]$/i, prep ? 'е' : 'я');
    if (/[ая]$/i.test(word)) return replace(/[ая]$/i, prep ? 'е' : 'ы');
    if (/[бвгджзклмнпрстфхцчшщ]$/i.test(word)) return word + (prep ? 'е' : 'а');
    return word;
  }

  if (grammaticalCase === 'accusative') {
    if (!female) return inflectWord(word, gender, 'genitive', isSurname);
    if (isSurname && /(?:ова|ева|ина)$/i.test(word)) return replace(/а$/i, 'у');
    if (/ая$/i.test(word)) return replace(/ая$/i, 'ую');
    if (/яя$/i.test(word)) return replace(/яя$/i, 'юю');
    if (/а$/i.test(word)) return replace(/а$/i, 'у');
    if (/я$/i.test(word)) return replace(/я$/i, 'ю');
  }
  return word;
}

export function inflectPersonName(name, gender, grammaticalCase = 'nominative') {
  if (grammaticalCase === 'nominative') return String(name || '').trim();
  return String(name || '').trim().split(/\s+/)
    .map((word, index) => inflectWord(word, gender, grammaticalCase, index > 0))
    .join(' ');
}

// Форма слова, согласованная с родом, или null — если слово вообще не носитель
// рода (тогда на нём предикатная зона заканчивается).
function agreedForm(word, gender) {
  const lower = word.toLowerCase();
  if (NOT_A_VERB.has(lower)) return null;
  for (const [male, female] of IRREGULAR_PAIRS) {
    if (lower === male || lower === female) return keepCase(word, gender === 'ж' ? female : male);
  }
  const masculine = /(?:лся|л)$/i.test(word) && word.length >= 3;
  const feminine = /(?:лась|ла)$/i.test(word) && word.length >= 4;
  if (!masculine && !feminine) return null;
  if (gender === 'ж') {
    if (/лся$/i.test(word)) return word.replace(/лся$/i, 'лась');
    if (/(?:лась|ла)$/i.test(word)) return word;
    return word + 'а';
  }
  if (/лась$/i.test(word)) return word.replace(/лась$/i, 'лся');
  if (/лся$/i.test(word)) return word;
  if (/ла$/i.test(word)) return word.slice(0, -1);
  return word;
}

// Текст активности — это сказуемое, идущее ЗА именем («<Имя> опубликовал…»),
// поэтому носители рода стоят в его начале. Идём слева направо, пока слова
// согласуются или служебные; первое «содержательное» слово (дополнение,
// предлог) зону закрывает — дальше правило не применяем, чтобы не тронуть
// существительное на «-л»/«-ла».
function scanPredicateZone(raw, gender, onWord) {
  const parts = String(raw || '').split(/([А-Яа-яЁё]+)/);
  for (let i = 1; i < parts.length; i += 2) {
    if (/[.!?]/.test(parts[i - 1] || '')) return i;      // конец предложения
    const word = parts[i];
    const agreed = agreedForm(word, gender);
    if (agreed !== null) { onWord(i, parts, agreed); continue; }
    if (PREDICATE_LEAD.has(word.toLowerCase())) continue;
    return i;
  }
  return parts.length;
}

export function agreeGenderText(raw, gender) {
  if (gender !== 'м' && gender !== 'ж') return raw;
  // Здесь человек — получатель, а род глагола задаёт существительное после него:
  // «Сергею понравился ваш момент». Пол Сергея не должен менять «понравился».
  if (NON_PERSON_SUBJECT.test(raw)) return raw;
  const parts = String(raw || '').split(/([А-Яа-яЁё]+)/);
  scanPredicateZone(raw, gender, (index, _parts, agreed) => { parts[index] = agreed; });
  return parts.join('');
}

// Похожие на глагол прошедшего времени слова ЗА пределами предикатной зоны:
// автоматически их не правим (там может быть существительное), но и молчать
// про них нельзя — это ровно те случаи, где правило может недоработать.
export function agreementWarnings(raw, gender) {
  if (gender !== 'м' && gender !== 'ж') return [];
  if (NON_PERSON_SUBJECT.test(raw)) return [];
  const parts = String(raw || '').split(/([А-Яа-яЁё]+)/);
  const zoneEnd = scanPredicateZone(raw, gender, () => {});
  const warnings = [];
  for (let i = zoneEnd; i < parts.length; i += 2) {
    const word = parts[i];
    if (!word || !/^[А-Яа-яЁё]+$/.test(word)) continue;
    const agreed = agreedForm(word, gender);
    if (agreed !== null && agreed !== word) {
      warnings.push(`«${word}» вне сказуемого похоже на глагол не того рода (ожидалось «${agreed}») — проверь вручную`);
    }
  }
  return warnings;
}

export function isDativeRecipientText(raw) {
  return NON_PERSON_SUBJECT.test(String(raw || ''));
}

export function replacePersonToken(html, name, gender) {
  let result = String(html || '');
  for (const { pattern, grammaticalCase } of CONTEXT_CASES) {
    result = result.replace(pattern, (_, before, governor, gap) =>
      `${before}${governor}${gap}<b>${inflectPersonName(name, gender, grammaticalCase)}</b>`);
  }
  for (const [preposition, grammaticalCase] of PREPOSITION_CASES) {
    const re = new RegExp(`(^|[\\s ])(${preposition})([\\s ]+)N(?=$|[\\s ,.!?—–-])`, 'gi');
    result = result.replace(re, (_, before, prep, gap) =>
      `${before}${prep}${gap}<b>${inflectPersonName(name, gender, grammaticalCase)}</b>`);
  }
  return result.replace(/\bN\b/g, `<b>${name}</b>`);
}

export const personIds = who => String(who || '').split(',').map(id => id.trim()).filter(Boolean);

const ADDRESSED_TO_USER = /(?:^|\s)(?:у|для)\s+вас(?=\s|$|[,.!?])/i;

// ЕДИНСТВЕННОЕ место, где решается, кто актёр, кто адресат токена N и надо ли
// печатать имя актёра перед текстом. Раньше это правило жило двумя копиями —
// в fetch-activity.mjs и в verify-activity-text.mjs — и они успели разойтись:
// у верификатора не было ветки primaryIsPlaceholder, поэтому активности с одним
// человеком и токеном N он молча пропускал вместо проверки.
export function personTextRoles(activity) {
  const ids = personIds(activity.who);
  const text = String(activity.text || '');
  const addressedToUser = ADDRESSED_TO_USER.test(text);
  const primaryIsPlaceholder = ids.length === 1 && /\bN\b/.test(text);
  const primaryId = ids[0] || String(activity.who || '');
  return {
    ids,
    primaryId,
    addressedToUser,
    primaryIsPlaceholder,
    // Кому принадлежит имя, подставляемое вместо N.
    referencedId: ids[1] || ((addressedToUser || primaryIsPlaceholder) ? primaryId : ''),
    // Имя актёра не печатаем: текст либо обращён к пользователю, либо уже
    // содержит имя через N.
    hideActorName: addressedToUser || primaryIsPlaceholder,
  };
}

export function activityTextIssues(activity, people) {
  const issues = [];
  if (activity.lead !== 'person') return issues;
  const byId = Array.isArray(people)
    ? Object.fromEntries(people.map(person => [String(person.id), person]))
    : people;
  const { ids, referencedId } = personTextRoles(activity);
  const primary = byId[String(ids[0])] || null;
  if (!ids[0]) issues.push('не заполнен первый человек в «кто»');
  for (const id of ids) if (!byId[String(id)]) issues.push(`не найден человек «${id}»`);

  const corrected = primary ? agreeGenderText(activity.text, primary.gender) : activity.text;
  if (corrected !== activity.text) issues.push(`род: «${activity.text}» → «${corrected}»`);
  if (primary) for (const warning of agreementWarnings(activity.text, primary.gender)) issues.push(warning);

  // Токен N обязан кем-то разрешаться, иначе он уедет в вёрстку как буква «N».
  if (/\bN\b/.test(corrected)) {
    const referenced = byId[String(referencedId)];
    if (!referencedId) issues.push('в тексте есть N, но некого подставить (нет второго id в «кто»)');
    else if (!referenced) issues.push(`не найден человек «${referencedId}» для подстановки N`);
    else {
      const name = String(referenced.name || '').replace(/\s*\(.*$/, '').trim();
      if (/\bN\b/.test(replacePersonToken(corrected, name, referenced.gender))) {
        issues.push('N не удалось заменить');
      }
    }
  }
  return issues;
}
