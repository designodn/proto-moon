import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityTextIssues,
  agreeGenderText,
  agreementWarnings,
  inflectPersonName,
  personTextRoles,
  replacePersonToken,
} from './activity-text.mjs';

const people = {
  4: { id: 4, name: 'Виктор Бондарев', gender: 'м' },
  5: { id: 5, name: 'Антонида Чекалова', gender: 'ж' },
};

test('склоняет N после предлога с в творительный падеж', () => {
  assert.equal(
    replacePersonToken('подружился с N', 'Антонида Чекалова', 'ж'),
    'подружился с <b>Антонидой Чекаловой</b>',
  );
});

test('поддерживает основные предложные падежи', () => {
  assert.equal(replacePersonToken('написал для N', 'Сергей Чернышов', 'м'), 'написал для <b>Сергея Чернышова</b>');
  assert.equal(replacePersonToken('подошёл к N', 'Сергей Чернышов', 'м'), 'подошёл к <b>Сергею Чернышову</b>');
  assert.equal(replacePersonToken('говорит о N', 'Антонида Чекалова', 'ж'), 'говорит о <b>Антониде Чекаловой</b>');
});

test('склоняет N в контекстах без предлога', () => {
  assert.equal(
    replacePersonToken('Заметка N набирает популярность', 'Виктор Бондарев', 'м'),
    'Заметка <b>Виктора Бондарева</b> набирает популярность',
  );
  assert.equal(
    replacePersonToken('Поздравьте N с 10-летием дружбы', 'Сергей Чернышов', 'м'),
    'Поздравьте <b>Сергея Чернышова</b> с 10-летием дружбы',
  );
});

test('согласует известные формы по человеку во всей фразе', () => {
  assert.equal(
    agreeGenderText('снова активна — добавила момент', 'м'),
    'снова активен — добавил момент',
  );
});

test('не согласует глагол с получателем, когда субъект — момент', () => {
  assert.equal(agreeGenderText('понравился ваш момент', 'ж'), 'понравился ваш момент');
  assert.equal(inflectPersonName('Сергей Чернышов', 'м', 'dative'), 'Сергею Чернышову');
});

test('верификатор разрешает N для единственного человека из «кто»', () => {
  const issues = activityTextIssues(
    { lead: 'person', who: '4', text: 'подружился с N' },
    people,
  );
  assert.deepEqual(issues, []);
  assert.ok(activityTextIssues({ lead: 'person', who: '404', text: 'написал' }, people)
    .some(issue => issue.includes('не найден человек')));
});

test('верификатор разрешает N из единственного кто в обращении «у вас»', () => {
  assert.deepEqual(
    activityTextIssues({ lead: 'person', who: '4', text: 'у вас с N общий друг' }, people),
    [],
  );
});

// ── Согласование рода правилом, а не списком ────────────────────────────────

test('согласует глаголы, которых нет ни в одном списке', () => {
  // Ни «отметила», ни «заходил», ни «распаковала» в списке исключений нет —
  // их берёт морфологическое правило «-л/-ла».
  assert.equal(agreeGenderText('отметила вас в заметке', 'м'), 'отметил вас в заметке');
  assert.equal(agreeGenderText('заходил к вам в гости', 'ж'), 'заходила к вам в гости');
  assert.equal(agreeGenderText('распаковала ваш подарок', 'м'), 'распаковал ваш подарок');
});

test('согласует возвратные формы «-лся/-лась»', () => {
  assert.equal(agreeGenderText('подружилась с N', 'м'), 'подружился с N');
  assert.equal(agreeGenderText('подружился с N', 'ж'), 'подружилась с N');
});

test('не трогает существительные на «-л» и «-ла»', () => {
  // Наивное правило превратило бы «гол» в «гола», а «школу» в «школ».
  assert.equal(agreeGenderText('забил гол', 'ж'), 'забила гол');
  assert.equal(agreeGenderText('окончила школа', 'м'), 'окончил школа');
});

test('останавливается на дополнении и не идёт вглубь фразы', () => {
  // «приз» и «реакцию» — за пределами сказуемого, их правило не касается.
  assert.equal(
    agreeGenderText('получила приз в Колесе призов', 'м'),
    'получил приз в Колесе призов',
  );
  assert.equal(
    agreeGenderText('оставила реакцию к вашему моменту', 'м'),
    'оставил реакцию к вашему моменту',
  );
});

test('пропускает служебные слова перед сказуемым', () => {
  assert.equal(
    agreeGenderText('снова активна — добавила момент', 'м'),
    'снова активен — добавил момент',
  );
});

test('сохраняет заглавную букву при согласовании', () => {
  assert.equal(agreeGenderText('Опубликовала заметку', 'м'), 'Опубликовал заметку');
});

test('предупреждает о похожем на глагол слове вне сказуемого', () => {
  // Автоматически не правим — там может быть существительное; но и молчать
  // нельзя, иначе пробел в правиле останется незамеченным.
  const warnings = agreementWarnings('ждёт ответа, вчера отметила вас', 'м');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /отметила/);
});

// ── Единое правило ролей: генератор и верификатор не должны расходиться ──────

test('роль адресата N: единственный человек в «кто» подставляется сам', () => {
  // Ровно эта ветка (primaryIsPlaceholder) отсутствовала в верификаторе, из-за
  // чего такие активности проверка молча пропускала.
  const roles = personTextRoles({ who: '4', text: 'Заметка N набирает популярность' });
  assert.equal(roles.referencedId, '4');
  assert.equal(roles.primaryIsPlaceholder, true);
  assert.equal(roles.hideActorName, true);
});

test('роль адресата N: при двух id подставляется второй', () => {
  const roles = personTextRoles({ who: '4, 5', text: 'подружился с N' });
  assert.equal(roles.referencedId, '5');
  assert.equal(roles.hideActorName, false);
});

test('обращение «у вас» скрывает имя актёра', () => {
  const roles = personTextRoles({ who: '4', text: 'У вас с N 3 общих друга' });
  assert.equal(roles.addressedToUser, true);
  assert.equal(roles.hideActorName, true);
  assert.equal(roles.referencedId, '4');
});

test('неразрешимый N попадает в структурные ошибки', () => {
  const issues = activityTextIssues(
    { id: 'x1', lead: 'person', who: '', text: 'подружился с N' }, people);
  assert.ok(issues.some(issue => issue.includes('некого подставить')));
});
