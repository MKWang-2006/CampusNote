// Reference data (ARCHITECTURE.md §6.6): topics and universities, read once and kept in memory,
// because these tables never change while the app runs. Also available in templates as `ref`.
//   ref.topics             [{ topic_id, code, name_en, name_zh, sort_order }] in tab order
//   ref.topic(code)        one topic, or undefined
//   ref.universities       [{ university_id, code, name_en, name_zh }]
//   ref.university(id)     one university, or undefined
const { q } = require('./db');

const ref = {
  topics: [],
  universities: [],
  topic: (code) => ref.topics.find((t) => t.code === code),
  university: (id) => ref.universities.find((u) => u.university_id === Number(id)),
  loaded: false,
};

let loading = null;

async function load() {
  const [topics, universities] = await Promise.all([
    q('SELECT topic_id, code, name_en, name_zh, sort_order FROM topics ORDER BY sort_order'),
    q('SELECT university_id, code, name_en, name_zh FROM universities ORDER BY university_id'),
  ]);
  ref.topics = topics;
  ref.universities = universities;
  ref.loaded = true;
  return ref;
}

// Middleware: the first request waits for the load; later ones find it done.
async function ensureRef(req, res, next) {
  if (!ref.loaded) {
    loading = loading || load().finally(() => (loading = null));
    await loading;
  }
  res.locals.ref = ref;
  next();
}

module.exports = ref;
module.exports.load = load;
module.exports.ensureRef = ensureRef;
