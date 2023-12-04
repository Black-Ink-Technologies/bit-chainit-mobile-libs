import moment from 'moment';
import { globalLogger } from '../common/logger';

export function isUserOverEighteen(birthDate: string) {
  const birthDay = moment(birthDate);
  const today = moment();
  globalLogger.debug('birthDay:', birthDay.format('MM/DD/YYYY'));
  const age = today.diff(birthDay, 'years');
  globalLogger.debug('age:', age);
  return age >= 18;
}
