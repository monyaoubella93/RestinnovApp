<?php

namespace App\Http\Controllers\Concerns;

/**
 * Custom validation messages for photo/audio upload fields, shared across
 * every controller that accepts one -- so a 422 from Laravel's own
 * validation reads the same clear French wording as the frontend's
 * friendlyUploadErrorMessage() fallback, instead of the default "The photo
 * field must not be greater than 10240 kilobytes."
 *
 * Both `max` (Laravel's own size check) and `uploaded` are covered: a file
 * larger than PHP's own upload_max_filesize never reaches Laravel's `max`
 * rule at all -- PHP marks it UPLOAD_ERR_INI_SIZE before validation runs,
 * which Laravel's File/Image rule instead reports as "failed to upload".
 * Since upload_max_filesize and the `max:` limit are set to the same value,
 * that's the message real oversized uploads mostly hit in practice.
 */
trait HasFriendlyUploadMessages
{
    protected function uploadValidationMessages(): array
    {
        $photoTooLarge = 'Photo trop lourde, réessayez avec une photo plus légère (10 Mo maximum).';
        $audioTooLarge = 'Enregistrement audio trop lourd, recommencez un enregistrement plus court (5 Mo maximum, soit environ 2 minutes).';

        return [
            'photo.max' => $photoTooLarge,
            'photo.uploaded' => $photoTooLarge,
            'photos.*.max' => $photoTooLarge,
            'photos.*.uploaded' => $photoTooLarge,
            'photo_apres.max' => $photoTooLarge,
            'photo_apres.uploaded' => $photoTooLarge,
            'motif_photo.max' => $photoTooLarge,
            'motif_photo.uploaded' => $photoTooLarge,
            'audio.max' => $audioTooLarge,
            'audio.uploaded' => $audioTooLarge,
            'motif_audio.max' => $audioTooLarge,
            'motif_audio.uploaded' => $audioTooLarge,
            'description_manager_audio.max' => $audioTooLarge,
            'description_manager_audio.uploaded' => $audioTooLarge,
        ];
    }
}
