import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Tandai endpoint dengan permission yang dibutuhkan.
 * Contoh: @Permissions('spmb.view', 'spmb.approve')
 */
export const Permissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);
