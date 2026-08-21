<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A maintenance agent's own intermediate note on an in-progress ticket --
     * distinct from the final resoudre() proof (photo_apres/cout_reparation/
     * note_resolution): this is for clarifying or asking a question before
     * or during the repair, not for the resolution itself. Same
     * photo/audio/note shape as ticket_maintenance_refus, just authored by
     * the agent instead of the Manager.
     */
    public function up(): void
    {
        Schema::create('messages_agent_maintenance', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_maintenance_id')->constrained('tickets_maintenance')->cascadeOnDelete();
            $table->string('photo_url')->nullable();
            $table->string('audio_url')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages_agent_maintenance');
    }
};
