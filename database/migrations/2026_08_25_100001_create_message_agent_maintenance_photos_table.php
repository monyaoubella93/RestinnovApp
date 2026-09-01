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
        // A previous version of this migration named its foreign key
        // constraint using Laravel's auto-generated default
        // ("message_agent_maintenance_photos_message_agent_maintenance_id_
        // foreign", 69 chars), which exceeds MySQL's 64-character identifier
        // limit (error 1059). The CREATE TABLE itself succeeded before that
        // failure, so the table was left behind without ever being recorded
        // as migrated -- every later deploy attempt then failed again with
        // "Table already exists" on this same migration. Drop that orphan
        // before recreating so an already-affected database self-heals.
        Schema::dropIfExists('message_agent_maintenance_photos');

        // Same "first photo stays on the parent row, extras land here"
        // pattern as ticket_maintenance_photos, but for a single message's
        // photo_url column instead of the ticket's own.
        Schema::create('message_agent_maintenance_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_agent_maintenance_id')
                ->constrained('messages_agent_maintenance', 'id', 'message_agent_maintenance_photos_message_id_foreign')
                ->cascadeOnDelete();
            $table->string('photo_url');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('message_agent_maintenance_photos');
    }
};
