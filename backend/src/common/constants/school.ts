/**
 * Info sekolah — digunakan di PDF, QR info page, dan email.
 * Bisa di-override via env (.env), defaultnya untuk SMK PGRI 3 Denpasar.
 */
export interface SchoolInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export const DEFAULT_SCHOOL: SchoolInfo = {
  name: 'SMK PGRI 3 Denpasar',
  address:
    'Jl. Drupadi XVII, Dewi Tara No. 7, Denpasar, Sumerta Kelod, ' +
    'Kec. Denpasar Timur, Kota Denpasar, Bali 80235',
  phone: '(0361) 264322',
  email: 'info@smk-pgri3dps.sch.id',
};

export function getSchoolInfo(env?: {
  SCHOOL_NAME?: string;
  SCHOOL_ADDRESS?: string;
  SCHOOL_PHONE?: string;
  SCHOOL_EMAIL?: string;
}): SchoolInfo {
  return {
    name: env?.SCHOOL_NAME?.trim() || DEFAULT_SCHOOL.name,
    address: env?.SCHOOL_ADDRESS?.trim() || DEFAULT_SCHOOL.address,
    phone: env?.SCHOOL_PHONE?.trim() || DEFAULT_SCHOOL.phone,
    email: env?.SCHOOL_EMAIL?.trim() || DEFAULT_SCHOOL.email,
  };
}
