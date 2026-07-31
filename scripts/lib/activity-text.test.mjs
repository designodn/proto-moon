import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityTextIssues,
  agreeGenderText,
  inflectPersonName,
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
