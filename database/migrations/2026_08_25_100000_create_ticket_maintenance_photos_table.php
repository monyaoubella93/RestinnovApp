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
        // A ticket's signalement (photo_url) and résolution (photo_apres)
        // each keep their own singular column as the primary/first photo --
        // every other file taken for the same report or the same repair
        // proof lands here instead, tagged by contexte, so nothing that
        // already reads photo_url/photo_apres needs to change.
        Schema::create('ticket_maintenance_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_maintenance_id')->constrained('tickets_maintenance')->cascadeOnDelete();
            $table->string('contexte');
            $table->string('photo_url');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticket_maintenance_photos');
    }
};
