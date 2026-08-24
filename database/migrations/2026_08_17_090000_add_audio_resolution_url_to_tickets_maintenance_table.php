<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tickets_maintenance', function (Blueprint $table) {
            // Optional voice note recorded by the maintenance agent when
            // marking the ticket resolved, alongside the mandatory
            // photo_apres -- lets them briefly explain the fix.
            $table->string('audio_resolution_url')->nullable()->after('note_resolution');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tickets_maintenance', function (Blueprint $table) {
            $table->dropColumn('audio_resolution_url');
        });
    }
};
