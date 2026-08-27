<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Replaces the previous ad hoc "one-off monthly charge" shape
     * (mois/description/quantite/prix_unitaire) with a proper recurring
     * charge/service model: a service has a montant + fréquence, is either
     * paid by RestInnov (deducted from the relevé) or by the propriétaire
     * (informational only), and is historized via date_debut/date_fin so a
     * later change of montant doesn't erase the previous period. The
     * previous table was only ever used by the manual "Charges" modal
     * added moments ago and never carried real production data.
     */
    public function up(): void
    {
        Schema::dropIfExists('charges_appartement');

        Schema::create('charges_appartement', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appartement_id')->constrained()->cascadeOnDelete();
            $table->string('nom_service');
            $table->decimal('montant', 10, 2);
            $table->string('frequence');
            $table->string('a_charge_de');
            $table->date('date_debut');
            $table->date('date_fin')->nullable();
            $table->timestamps();

            $table->index(['appartement_id', 'date_debut', 'date_fin']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('charges_appartement');

        Schema::create('charges_appartement', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appartement_id')->constrained()->cascadeOnDelete();
            $table->string('mois');
            $table->string('description');
            $table->decimal('quantite', 8, 2)->default(1);
            $table->decimal('prix_unitaire', 10, 2);
            $table->timestamps();

            $table->index(['appartement_id', 'mois']);
        });
    }
};
