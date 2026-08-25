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
        // Same "first photo stays on the parent row, extras land here"
        // pattern as ticket_maintenance_photos, but for a single message's
        // photo_url column instead of the ticket's own.
        Schema::create('message_agent_maintenance_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_agent_maintenance_id')->constrained('messages_agent_maintenance')->cascadeOnDelete();
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
