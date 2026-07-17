/**
 * SECURE / SECURE 2.0 RMD start age from birth year.
 * Without a full birth date, year 1949 is treated as age 72 (the post-1949-06-30 rule).
 */
export function getRmdStartAge(birthYear){
  if(birthYear == null || birthYear === '') return null;
  const year = Number(birthYear);
  if(!Number.isFinite(year)) return null;
  if(year >= 1960) return 75;
  if(year >= 1951) return 73;
  if(year >= 1949) return 72;
  return 70.5;
}

/** Infer birth year from attained age in an as-of calendar year. */
export function inferBirthYear(currentAge, asOfYear = new Date().getFullYear()){
  const age = Number(currentAge);
  const year = Number(asOfYear);
  if(!Number.isFinite(age) || !Number.isFinite(year)) return null;
  return year - age;
}

/**
 * Prefer a confirmed YYYY-MM-DD birth date when present (1949 mid-year edge).
 * Otherwise fall back to birth-year rules.
 */
export function getRmdStartAgeFromBirthDate(birthDate){
  if(typeof birthDate !== 'string') return null;
  const year = Number(birthDate.slice(0, 4));
  if(!Number.isInteger(year)) return null;
  if(year === 1949 && birthDate < '1949-07-01') return 70.5;
  return getRmdStartAge(year);
}
