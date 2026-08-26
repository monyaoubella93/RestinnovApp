<?php
use Carbon\Carbon;

$debutMois = Carbon::createFromFormat('Y-m-d', $mois.'-01')->startOfMonth();
$finMois = $debutMois->copy()->endOfMonth();
[$anneeMois, $numeroMois] = explode('-', $mois);
$numeroFacture = ((int) $numeroMois).'-'.$anneeMois;
$dateFacture = now()->format('d/m/Y');
$dateLivraison = $finMois->format('d/m/Y');

$proprietaire = $appartement['proprietaire'];
$sousLocation = $appartement['mode_gestion'] === 'sous_location';
$logoBase64 = base64_encode(file_get_contents(resource_path('images/logo.png')));
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Facture {{ $numeroFacture }} - {{ $appartement['nom'] }}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #1f2937; }
        table { width: 100%; border-collapse: collapse; }
        .no-border, .no-border td { border: none; }
        .titre-facture { font-size: 22px; font-weight: bold; color: #1e3a5f; text-align: right; }
        .bloc-adresse { line-height: 1.5; }
        .bloc-adresse strong { font-weight: bold; }
        .meta-table td { padding: 2px 8px; }
        .meta-table .meta-label { font-weight: bold; white-space: nowrap; }
        .bandeau { background-color: #1a5fa8; color: #ffffff; font-weight: bold; padding: 4px 8px; margin-top: 18px; }
        .bloc-parties { margin-top: 0; }
        .bloc-parties td { vertical-align: top; padding-top: 8px; width: 50%; }
        .bloc-parties .contact-nom { font-weight: bold; }

        .table-lignes { margin-top: 4px; }
        .table-lignes thead th { background-color: #1a5fa8; color: #ffffff; text-align: left; padding: 5px 8px; font-size: 10px; text-transform: uppercase; }
        .table-lignes thead th.montant, .table-lignes tbody td.montant { text-align: right; }
        .table-lignes tbody td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        .table-lignes tbody tr.section-titre td { background-color: #fdf1d6; font-weight: bold; border-bottom: none; }
        .table-lignes tbody tr.ligne-total td { font-weight: bold; font-size: 13px; border-top: 2px solid #1f2937; border-bottom: none; }
        .table-lignes tbody td.montant-vert { background-color: #e6f4ea; }
        .empty { color: #9ca3af; font-style: italic; padding: 6px 8px; }

        .taux-contractuel { margin-top: 4px; background-color: #fdf1d6; text-align: center; font-weight: bold; padding: 6px; }

        .recap { margin-top: 18px; width: 60%; margin-left: auto; }
        .recap td { padding: 4px 8px; }
        .recap .label { text-align: right; font-weight: bold; }
        .recap .montant { text-align: right; }
        .recap .ligne-finale .label { font-size: 15px; }
        .recap .ligne-finale .montant { font-size: 20px; font-weight: bold; background-color: #e6f4ea; }

        .avertissement { margin-top: 24px; text-align: center; color: #b91c1c; font-style: italic; font-size: 11px; }
        .pied-page { margin-top: 8px; text-align: center; font-size: 9px; border-top: 1px solid #d1d5db; padding-top: 6px; color: #374151; }
    </style>
</head>
<body>
    <table class="no-border">
        <tr>
            <td style="width: 60%;" class="bloc-adresse">
                <img src="data:image/png;base64,{{ $logoBase64 }}" alt="RestInnov" style="height: 42px; margin-bottom: 8px;"><br>
                BUREAU A225 2EME ÉTAGE LA CITE DE L'INNOVATION<br>
                SOUSS MASSA - AGADIR<br>
                80000<br>
                00 212 7 08 28 61 64
            </td>
            <td style="width: 40%;">
                <div class="titre-facture">Facture</div>
                <table class="meta-table no-border">
                    <tr><td class="meta-label">Code Propriété :</td><td>{{ $appartement['nom'] }}</td></tr>
                    <tr><td class="meta-label">Numéro de Facture :</td><td>{{ $numeroFacture }}</td></tr>
                    <tr><td class="meta-label">Date de Facture :</td><td>{{ $dateFacture }}</td></tr>
                    <tr><td class="meta-label">Date de Livraison :</td><td>{{ $dateLivraison }}</td></tr>
                </table>
            </td>
        </tr>
    </table>

    <table class="no-border bloc-parties">
        <tr>
            <td>
                <div class="bandeau">Facturer par :</div>
                <div style="padding-top: 6px;">
                    <span class="contact-nom">RestInnov</span><br>
                    BUREAU A225 2EME ÉTAGE LA CITE DE L'INNOVATION<br>
                    SOUSS MASSA - AGADIR<br>
                    80000<br>
                    212 7 08 28 61 64<br>
                    contact@rest-innov.com
                </div>
            </td>
            <td>
                <div class="bandeau">Service rendu à :</div>
                <div style="padding-top: 6px;">
                    @if ($proprietaire)
                        <span class="contact-nom">{{ $proprietaire['nom'] }}</span><br>
                        @if (! empty($proprietaire['adresse']))
                            {{ $proprietaire['adresse'] }}<br>
                        @endif
                        @if (! empty($proprietaire['telephone']))
                            {{ $proprietaire['telephone'] }}<br>
                        @endif
                        @if (! empty($proprietaire['email']))
                            {{ $proprietaire['email'] }}
                        @endif
                    @else
                        <span class="empty">Propriétaire non renseigné</span>
                    @endif
                </div>
            </td>
        </tr>
    </table>

    <table class="table-lignes">
        <thead>
            <tr>
                <th>Description</th>
                <th>Quantité ou Nuitées</th>
                <th class="montant">PU/PN</th>
                <th class="montant">Prix total TTC</th>
            </tr>
        </thead>
        <tbody>
            <tr class="section-titre"><td colspan="4">Séjours</td></tr>
            @if (count($sejours) === 0)
                <tr><td colspan="4" class="empty">Aucun séjour ce mois-ci.</td></tr>
            @else
                @foreach ($sejours as $sejour)
                    <tr>
                        <td>Séjour {{ $loop->iteration }}: {{ $sejour['periode'] }}</td>
                        <td>{{ $sejour['nuitees'] }}</td>
                        <td class="montant">{{ number_format($sejour['nuitees'] > 0 ? $sejour['montant_mad'] / $sejour['nuitees'] : 0, 2) }}</td>
                        <td class="montant montant-vert">{{ number_format($sejour['montant_mad'], 2) }}</td>
                    </tr>
                @endforeach
                <tr class="ligne-total">
                    <td>Total:</td>
                    <td>{{ collect($sejours)->sum('nuitees') }}</td>
                    <td></td>
                    <td class="montant montant-vert">{{ number_format($revenus_bruts, 2) }}</td>
                </tr>
            @endif

            <tr class="section-titre"><td colspan="4">Les charges:</td></tr>
            @php
                $fraisMenageForfaitTotal = collect($frais_menage_detail)->sum('forfait');
                $fraisMenageProduitsTotal = collect($frais_menage_detail)
                    ->flatMap(fn ($ligne) => $ligne['produits'])
                    ->where('type_utilisation', 'rachete')
                    ->sum('prix_paye');
                $nbMenages = count($frais_menage_detail);
                $chargesVides = $nbMenages === 0
                    && $fraisMenageProduitsTotal <= 0
                    && count($frais_maintenance_detail) === 0
                    && count($charges_supplementaires_detail) === 0;
            @endphp
            @if ($chargesVides)
                <tr><td colspan="4" class="empty">Aucune charge ce mois-ci.</td></tr>
            @else
                @if ($nbMenages > 0)
                    <tr>
                        <td>Ménage aprés chaque séjour:</td>
                        <td>{{ $nbMenages }}</td>
                        <td class="montant">{{ number_format($fraisMenageForfaitTotal / $nbMenages, 2) }}</td>
                        <td class="montant montant-vert">{{ number_format($fraisMenageForfaitTotal, 2) }}</td>
                    </tr>
                @endif
                @if ($fraisMenageProduitsTotal > 0)
                    <tr>
                        <td>Produits de nettoyage:</td>
                        <td>1</td>
                        <td class="montant">{{ number_format($fraisMenageProduitsTotal, 2) }}</td>
                        <td class="montant montant-vert">{{ number_format($fraisMenageProduitsTotal, 2) }}</td>
                    </tr>
                @endif
                @foreach ($frais_maintenance_detail as $frais)
                    <tr>
                        <td>{{ $frais['description'] }}:</td>
                        <td>1</td>
                        <td class="montant">{{ number_format($frais['prix'], 2) }}</td>
                        <td class="montant montant-vert">{{ number_format($frais['prix'], 2) }}</td>
                    </tr>
                @endforeach
                @foreach ($charges_supplementaires_detail as $charge)
                    <tr>
                        <td>{{ $charge['description'] }}:</td>
                        <td>{{ rtrim(rtrim(number_format($charge['quantite'], 2), '0'), '.') }}</td>
                        <td class="montant">{{ number_format($charge['prix_unitaire'], 2) }}</td>
                        <td class="montant montant-vert">{{ number_format($charge['total'], 2) }}</td>
                    </tr>
                @endforeach
                <tr class="ligne-total">
                    <td colspan="3">Total:</td>
                    <td class="montant montant-vert">{{ number_format($frais_menage_total + $frais_maintenance_total + $charges_supplementaires_total, 2) }}</td>
                </tr>
            @endif
        </tbody>
    </table>

    @unless ($sousLocation)
        <div class="taux-contractuel">Taux Contractuel: {{ number_format((float) $appartement['taux_commission'], 0) }}%</div>
    @else
        <div class="taux-contractuel">Loyer fixe mensuel: {{ number_format((float) $appartement['loyer_fixe_mensuel'], 2) }} MAD</div>
    @endunless

    <table class="recap">
        <tr>
            <td class="label">SOUS-TOTAL de Chiffre d'affaire:</td>
            <td class="montant">{{ number_format($revenus_bruts, 2) }}</td>
        </tr>
        <tr>
            <td class="label">TOTAL Depense:</td>
            <td class="montant">{{ number_format($frais_menage_total + $frais_maintenance_total + $charges_supplementaires_total, 2) }}</td>
        </tr>
        @unless ($sousLocation)
            <tr>
                <td class="label">TOTAL de Frais de Service:</td>
                <td class="montant">{{ number_format($commission_restinnov, 2) }}</td>
            </tr>
            <tr>
                <td class="label">TOTAL HC:</td>
                <td class="montant">{{ number_format($montant_proprietaire, 2) }}</td>
            </tr>
            <tr>
                <td class="label">TAUX DE Commission:</td>
                <td class="montant">{{ number_format(((float) $appartement['taux_commission']) / 100, 2) }}</td>
            </tr>
        @endunless
        <tr class="ligne-finale">
            <td class="label">SOMME FINALE À PAYER:</td>
            <td class="montant">{{ number_format($montant_proprietaire, 2) }}</td>
        </tr>
    </table>

    <p class="avertissement">Si vous avez des questions sur cette facture, n'hésitez pas à nous contacter.</p>
    <div class="pied-page">
        Yokeru SARL (RestInnov) - ICE : 003299824000028 - BUREAU A225 2EME ÉTAGE LA CITE DE L'INNOVATION SOUSS MASSA - AGADIR - contact@rest-innov.com
    </div>
</body>
</html>
