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

const GENDER_PAIRS = [
  ['активен', 'активна'], ['добавил', 'добавила'], ['опубликовал', 'опубликовала'],
  ['подружился', 'подружилась'], ['поставил', 'поставила'], ['оценил', 'оценила'],
  ['написал', 'написала'], ['поделился', 'поделилась'], ['вернулся', 'вернулась'],
];

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

export function agreeGenderText(raw, gender) {
  if (gender !== 'м' && gender !== 'ж') return raw;
  // Здесь человек — получатель, а род глагола задаёт существительное после него:
  // «Сергею понравился ваш момент». Пол Сергея не должен менять «понравился».
  if (NON_PERSON_SUBJECT.test(raw)) return raw;
  let result = String(raw || '');
  for (const [male, female] of GENDER_PAIRS) {
    const source = gender === 'ж' ? male : female;
    const target = gender === 'ж' ? female : male;
    result = result.replace(new RegExp(`(^|[^А-Яа-яЁё])(${source})(?=$|[^А-Яа-яЁё])`, 'gi'),
      (_, before, found) => before + keepCase(found, target));
  }
  return result;
}

export function isDativeRecipientText(raw) {
  return NON_PERSON_SUBJECT.test(String(raw || ''));
}

export function replacePersonToken(html, name, gender) {
  let result = String(html || '');
  for (const [preposition, grammaticalCase] of PREPOSITION_CASES) {
    const re = new RegExp(`(^|[\\s ])(${preposition})([\\s ]+)N(?=$|[\\s ,.!?—–-])`, 'gi');
    result = result.replace(re, (_, before, prep, gap) =>
      `${before}${prep}${gap}<b>${inflectPersonName(name, gender, grammaticalCase)}</b>`);
  }
  return result.replace(/\bN\b/g, `<b>${name}</b>`);
}

export function activityTextIssues(activity, people) {
  const issues = [];
  if (activity.lead !== 'person') return issues;
  const ids = String(activity.who || '').split(',').map(s => s.trim()).filter(Boolean);
  const byId = Array.isArray(people)
    ? Object.fromEntries(people.map(person => [String(person.id), person]))
    : people;
  const primary = byId[String(ids[0])] || null;
  if (!ids[0]) issues.push('не заполнен первый человек в «кто»');
  for (const id of ids) if (!byId[String(id)]) issues.push(`не найден человек «${id}»`);
  const corrected = primary ? agreeGenderText(activity.text, primary.gender) : activity.text;
  if (corrected !== activity.text) issues.push(`род: «${activity.text}» → «${corrected}»`);
  return issues;
}
