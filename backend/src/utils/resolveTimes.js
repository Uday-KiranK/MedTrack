const TIME_SLOTS = require("./timeSlots");

function normalizeTime(t) {
  return t.slice(0, 5); // converts "18:56:00" → "18:56"
}

function resolveTimes(medicine) {
  if (medicine.custom_times && medicine.custom_times.length > 0) {
    return medicine.custom_times.map(normalizeTime);
  }

  return medicine.time_slots.map(slot => TIME_SLOTS[slot]);
}

module.exports = resolveTimes;
