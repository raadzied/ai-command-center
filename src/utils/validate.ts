/**
 * تتحقق مما إذا كان تنسيق سلسلة نصية يمثل بريدًا إلكترونيًا صالحًا.
 *
 * @param email - سلسلة نصية للتحقق منها.
 * @returns `true` إذا كان التنسيق صالحًا، وإلا `false`.
 */
function isValidEmail(email: string): boolean {
  // تعبير نمطي بسيط للتحقق من تنسيق البريد الإلكتروني.
  // هذا التعبير لا يغطي جميع الحالات المعقدة، ولكنه كافٍ لمعظم الاستخدامات.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export { isValidEmail };