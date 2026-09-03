import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DashboardSection } from './DashboardSection'
import type { DashboardData } from '../types'

const data: DashboardData = {
  revenus_totaux: 1800,
  frais_menage_totaux: 100,
  frais_maintenance_totaux: 350,
  resultat_net: 1350,
  appartements: [
    { id: 1, nom: 'Loft Bastille', statut: 'disponible', sejours_count: 3, dernier_sejour: '2026-03-05' },
    { id: 2, nom: 'Zenith', statut: 'occupe', sejours_count: 0, dernier_sejour: null },
  ],
  sejours_par_statut: { a_venir: 2, en_cours: 1, termine: 3 },
  sejours_recents: [
    {
      id: 10,
      nom_voyageur: 'Jean Dupont',
      date_arrivee: '2026-08-01',
      statut: 'a_venir',
      appartement: { id: 1, nom: 'Loft Bastille' },
    },
    {
      id: 11,
      nom_voyageur: 'Marie Curie',
      date_arrivee: '2026-07-20',
      statut: 'termine',
      appartement: { id: 2, nom: 'Zenith' },
    },
  ],
  departs_aujourdhui: [],
  problemes_signales: [],
  menages_a_valider: [],
  resolutions_a_valider: [],
}

describe('DashboardSection', () => {
  it('affiche un message de chargement', () => {
    render(<DashboardSection data={null} loading={true} error={null} />)

    expect(screen.getByText(/chargement du dashboard/i)).toBeInTheDocument()
  })

  it('affiche une erreur si le chargement échoue', () => {
    render(<DashboardSection data={null} loading={false} error="Impossible de charger le dashboard." />)

    expect(screen.getByText('Impossible de charger le dashboard.')).toBeInTheDocument()
  })

  it('affiche les agrégats financiers', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    expect(screen.getByTestId('dashboard-revenus-totaux')).toHaveTextContent('1800.00 MAD')
    expect(screen.getByTestId('dashboard-frais-menage-totaux')).toHaveTextContent('100.00 MAD')
    expect(screen.getByTestId('dashboard-frais-maintenance-totaux')).toHaveTextContent('350.00 MAD')
    expect(screen.getByTestId('dashboard-resultat-net')).toHaveTextContent('1350.00 MAD')
  })

  it('donne un fond marine à la carte "Résultat net", blanc aux trois autres', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    expect(screen.getByTestId('dashboard-revenus-totaux').closest('div.rounded-card-manager')).toHaveClass('bg-surface')
    expect(screen.getByTestId('dashboard-frais-menage-totaux').closest('div.rounded-card-manager')).toHaveClass('bg-surface')
    expect(screen.getByTestId('dashboard-frais-maintenance-totaux').closest('div.rounded-card-manager')).toHaveClass(
      'bg-surface',
    )
    expect(screen.getByTestId('dashboard-resultat-net').closest('div.rounded-card-manager')).toHaveClass('bg-marine')
  })

  it('affiche le nombre de séjours par statut sous forme de mini-cartes cliquables', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    expect(screen.getByRole('button', { name: /2\s*à venir/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1\s*en cours/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3\s*terminé/i })).toBeInTheDocument()
  })

  it('bascule vers la liste des séjours filtrée au clic sur une mini-carte de statut', async () => {
    const user = userEvent.setup()
    const onNavigateToSejoursListe = vi.fn()
    render(
      <DashboardSection
        data={data}
        loading={false}
        error={null}
        onNavigateToSejoursListe={onNavigateToSejoursListe}
      />,
    )

    await user.click(screen.getByRole('button', { name: /2\s*à venir/i }))

    expect(onNavigateToSejoursListe).toHaveBeenCalledWith('a_venir')
  })

  it('liste les appartements avec leur statut, nombre de séjours et dernier séjour', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '3' })).toBeInTheDocument()
    expect(screen.getByText('05/03/2026')).toBeInTheDocument()
    expect(screen.getByText('Zenith')).toBeInTheDocument()
    expect(screen.getByText('Occupé')).toBeInTheDocument()
    expect(screen.getByText('Aucun')).toBeInTheDocument()
  })

  it('affiche le badge "En ménage" pour un appartement en_menage', () => {
    render(
      <DashboardSection
        data={{ ...data, appartements: [{ id: 1, nom: 'Loft Bastille', statut: 'en_menage', sejours_count: 1, dernier_sejour: '2026-03-05' }] }}
        loading={false}
        error={null}
      />,
    )

    expect(screen.getByText('En ménage')).toBeInTheDocument()
  })

  it('affiche le badge "Maintenance" pour un appartement en maintenance', () => {
    render(
      <DashboardSection
        data={{ ...data, appartements: [{ id: 1, nom: 'Loft Bastille', statut: 'maintenance', sejours_count: 1, dernier_sejour: '2026-03-05' }] }}
        loading={false}
        error={null}
      />,
    )

    expect(screen.getByRole('cell', { name: 'Maintenance' })).toBeInTheDocument()
  })

  it('affiche les problèmes signalés avec adresse et badge d\'urgence, navigue directement vers le ticket', async () => {
    const user = userEvent.setup()
    const onNavigateToTicketDetail = vi.fn()

    render(
      <DashboardSection
        data={{
          ...data,
          problemes_signales: [
            {
              id: 3,
              photo_url: 'tickets-maintenance/photo.jpg',
              description: 'La chasse d\'eau ne fonctionne plus.',
              urgence: 'haute',
              statut: 'ouvert',
              appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
            },
          ],
        }}
        loading={false}
        error={null}
        onNavigateToTicketDetail={onNavigateToTicketDetail}
      />,
    )

    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Haute')).toBeInTheDocument()

    await user.click(screen.getByText('12 rue de la Roquette'))
    expect(onNavigateToTicketDetail).toHaveBeenCalledWith(3)
  })

  // Régression : ce snapshot du Dashboard peut être un peu ancien au moment
  // du clic -- le ticket peut avoir été assigné entre-temps. La navigation
  // doit mener au ticket lui-même, jamais à une liste filtrée par son
  // ancien statut ("ouvert") qui le masquerait silencieusement.
  it('navigue vers le problème signalé même si son statut a changé depuis le chargement du Dashboard', async () => {
    const user = userEvent.setup()
    const onNavigateToTicketDetail = vi.fn()

    render(
      <DashboardSection
        data={{
          ...data,
          problemes_signales: [
            {
              id: 8,
              photo_url: null,
              description: 'Fuite au robinet.',
              urgence: 'haute',
              statut: 'assigne',
              appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
            },
          ],
        }}
        loading={false}
        error={null}
        onNavigateToTicketDetail={onNavigateToTicketDetail}
      />,
    )

    await user.click(screen.getByText('12 rue de la Roquette'))
    expect(onNavigateToTicketDetail).toHaveBeenCalledWith(8)
  })

  it('affiche un message quand aucun problème n\'est signalé', () => {
    render(<DashboardSection data={{ ...data, problemes_signales: [] }} loading={false} error={null} />)

    expect(screen.getByText('Aucun problème signalé.')).toBeInTheDocument()
  })

  it('affiche les ménages à valider avec adresse et voyageur, cliquable vers le séjour', async () => {
    const user = userEvent.setup()
    const onNavigateToSejour = vi.fn()

    render(
      <DashboardSection
        data={{
          ...data,
          menages_a_valider: [
            {
              id: 10,
              sejour_id: 42,
              nom_voyageur: 'Amina Bennani',
              appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
            },
          ],
        }}
        loading={false}
        error={null}
        onNavigateToSejour={onNavigateToSejour}
      />,
    )

    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Amina Bennani')).toBeInTheDocument()

    await user.click(screen.getByText('Amina Bennani'))
    expect(onNavigateToSejour).toHaveBeenCalledWith(42)
  })

  it('affiche un message quand aucun ménage n\'est en attente de validation', () => {
    render(<DashboardSection data={{ ...data, menages_a_valider: [] }} loading={false} error={null} />)

    expect(screen.getByText('Aucun ménage en attente.')).toBeInTheDocument()
  })

  it('affiche les résolutions à valider avec adresse et coût, navigue directement vers le ticket', async () => {
    const user = userEvent.setup()
    const onNavigateToTicketDetail = vi.fn()

    render(
      <DashboardSection
        data={{
          ...data,
          resolutions_a_valider: [
            {
              id: 6,
              photo_apres: 'tickets-maintenance/apres.jpg',
              cout_reparation: '45.50',
              description_manager: 'Changer le joint du robinet.',
              statut: 'resolu_en_attente_validation',
              appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
            },
          ],
        }}
        loading={false}
        error={null}
        onNavigateToTicketDetail={onNavigateToTicketDetail}
      />,
    )

    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('45.50 MAD')).toBeInTheDocument()

    await user.click(screen.getByText('12 rue de la Roquette'))
    expect(onNavigateToTicketDetail).toHaveBeenCalledWith(6)
  })

  // Régression : le Manager (ou un autre) peut avoir déjà validé/refusé
  // cette résolution depuis un autre écran juste avant le clic -- la
  // navigation doit mener au ticket, pas à une liste filtrée par
  // "resolu_en_attente_validation" qui ne le contiendrait plus.
  it('navigue vers la résolution à valider même si son statut a changé depuis le chargement du Dashboard', async () => {
    const user = userEvent.setup()
    const onNavigateToTicketDetail = vi.fn()

    render(
      <DashboardSection
        data={{
          ...data,
          resolutions_a_valider: [
            {
              id: 9,
              photo_apres: 'tickets-maintenance/apres.jpg',
              cout_reparation: '20',
              description_manager: null,
              statut: 'resolu',
              appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
            },
          ],
        }}
        loading={false}
        error={null}
        onNavigateToTicketDetail={onNavigateToTicketDetail}
      />,
    )

    await user.click(screen.getByText('12 rue de la Roquette'))
    expect(onNavigateToTicketDetail).toHaveBeenCalledWith(9)
  })

  it('affiche un message quand aucune résolution n\'est à valider', () => {
    render(<DashboardSection data={{ ...data, resolutions_a_valider: [] }} loading={false} error={null} />)

    expect(screen.getByText('Aucune résolution en attente.')).toBeInTheDocument()
  })

  it('affiche le total combiné des 3 catégories dans le badge "À traiter aujourd\'hui"', () => {
    render(
      <DashboardSection
        data={{
          ...data,
          menages_a_valider: [
            { id: 1, sejour_id: 10, nom_voyageur: 'Jean Dupont', appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' } },
          ],
          problemes_signales: [
            { id: 1, photo_url: null, description: null, urgence: 'haute', statut: 'ouvert', appartement: { id: 2, nom: 'Zenith', adresse: '5 avenue de la Paix' } },
          ],
          resolutions_a_valider: [
            { id: 1, photo_apres: null, cout_reparation: '45.50', description_manager: null, statut: 'resolu_en_attente_validation', appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' } },
          ],
        }}
        loading={false}
        error={null}
      />,
    )

    const heading = screen.getByText("À traiter aujourd'hui")
    expect(heading).toBeInTheDocument()
    expect(within(heading.parentElement as HTMLElement).getByText('3')).toBeInTheDocument()
  })

  it('calcule la répartition ménage/maintenance du donut à partir des totaux réels', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    expect(screen.getByText('Répartition des charges')).toBeInTheDocument()
    // frais_menage_totaux: 100, frais_maintenance_totaux: 350 => 22 % / 78 %
    expect(screen.getByText(/22\s*%/)).toBeInTheDocument()
    expect(screen.getByText(/78\s*%/)).toBeInTheDocument()
  })

  it('précise que le résultat net n\'inclut pas la commission propriétaire', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    expect(screen.getByText(/commission propriétaire/i)).toBeInTheDocument()
  })

  it('bascule vers la section Appartements au clic sur une ligne du tableau', async () => {
    const user = userEvent.setup()
    const onNavigateToAppartements = vi.fn()
    render(
      <DashboardSection
        data={data}
        loading={false}
        error={null}
        onNavigateToAppartements={onNavigateToAppartements}
      />,
    )

    await user.click(screen.getByText('Loft Bastille'))

    expect(onNavigateToAppartements).toHaveBeenCalledTimes(1)
  })

  it('affiche un message quand il n\'y a aucun appartement', () => {
    render(
      <DashboardSection
        data={{ ...data, appartements: [] }}
        loading={false}
        error={null}
      />,
    )

    expect(screen.getByText(/aucun appartement pour le moment/i)).toBeInTheDocument()
  })

  it('affiche les séjours récents avec voyageur, appartement, date et statut', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    expect(screen.getByText('Séjours récents')).toBeInTheDocument()
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    expect(screen.getByText(/Loft Bastille · 01\/08\/2026/)).toBeInTheDocument()
    expect(screen.getByText('Marie Curie')).toBeInTheDocument()
    expect(screen.getByText(/Zenith · 20\/07\/2026/)).toBeInTheDocument()
  })

  it('affiche un message quand il n\'y a aucun séjour récent', () => {
    render(<DashboardSection data={{ ...data, sejours_recents: [] }} loading={false} error={null} />)

    expect(screen.getByText(/aucun séjour pour le moment/i)).toBeInTheDocument()
  })

  it('affiche le détail d\'un séjour au clic sur une ligne de "Séjours récents"', async () => {
    const user = userEvent.setup()
    const onNavigateToSejour = vi.fn()
    render(<DashboardSection data={data} loading={false} error={null} onNavigateToSejour={onNavigateToSejour} />)

    await user.click(screen.getByRole('button', { name: /jean dupont/i }))

    expect(onNavigateToSejour).toHaveBeenCalledWith(10)
  })

  it('bascule vers la liste complète des séjours au clic sur "Voir tous les séjours"', async () => {
    const user = userEvent.setup()
    const onNavigateToSejoursListe = vi.fn()
    render(
      <DashboardSection
        data={data}
        loading={false}
        error={null}
        onNavigateToSejoursListe={onNavigateToSejoursListe}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir tous les séjours/i }))

    expect(onNavigateToSejoursListe).toHaveBeenCalledWith()
  })

  it('affiche "Séjours récents" et "Appartements" côte à côte en grille à deux colonnes', () => {
    render(<DashboardSection data={data} loading={false} error={null} />)

    const sejoursRecentsHeading = screen.getByText('Séjours récents')
    const appartementsHeading = screen.getByText('Appartements')
    const grid = sejoursRecentsHeading.closest('.grid')

    expect(grid).toHaveClass('lg:grid-cols-2')
    expect(grid).toContainElement(appartementsHeading)
  })

  describe('bandeau "Départs prévus aujourd\'hui"', () => {
    const departsAujourdhui: DashboardData['departs_aujourdhui'] = [
      {
        id: 20,
        reference: 'SEJ-0020',
        voyageur_principal: 'Karim Benali',
        telephone_voyageur: '+212600000000',
        appartement: { id: 1, nom: 'Loft Bastille' },
      },
    ]

    it('ne s\'affiche pas quand il n\'y a aucun départ aujourd\'hui', () => {
      render(<DashboardSection data={data} loading={false} error={null} />)

      expect(screen.queryByText(/départ.*prévu.*aujourd'hui/i)).not.toBeInTheDocument()
    })

    it('affiche le nombre de départs prévus aujourd\'hui', () => {
      render(
        <DashboardSection
          data={{ ...data, departs_aujourdhui: departsAujourdhui }}
          loading={false}
          error={null}
        />,
      )

      expect(screen.getByText(/1 départ prévu aujourd'hui/i)).toBeInTheDocument()
    })

    it('affiche le pluriel quand il y a plusieurs départs', () => {
      render(
        <DashboardSection
          data={{
            ...data,
            departs_aujourdhui: [
              ...departsAujourdhui,
              { ...departsAujourdhui[0], id: 21, reference: 'SEJ-0021', voyageur_principal: 'Sara Idrissi' },
            ],
          }}
          loading={false}
          error={null}
        />,
      )

      expect(screen.getByText(/2 départs prévus aujourd'hui/i)).toBeInTheDocument()
    })

    it('déplie la liste des départs au clic sur le bandeau', async () => {
      const user = userEvent.setup()
      render(
        <DashboardSection
          data={{ ...data, departs_aujourdhui: departsAujourdhui }}
          loading={false}
          error={null}
        />,
      )

      expect(screen.queryByText('Karim Benali')).not.toBeInTheDocument()

      await user.click(screen.getByText(/1 départ prévu aujourd'hui/i))

      expect(screen.getByText('Karim Benali')).toBeInTheDocument()
      expect(screen.getByText('SEJ-0020')).toBeInTheDocument()
      expect(screen.getByText(/Loft Bastille · \+212600000000/)).toBeInTheDocument()
    })

    it('déclenche le checkout au clic sur "Confirmer le checkout" d\'une ligne de départ', async () => {
      const user = userEvent.setup()
      const onCheckout = vi.fn().mockResolvedValue(undefined)
      render(
        <DashboardSection
          data={{ ...data, departs_aujourdhui: departsAujourdhui }}
          loading={false}
          error={null}
          onCheckout={onCheckout}
        />,
      )

      await user.click(screen.getByText(/1 départ prévu aujourd'hui/i))
      await user.click(screen.getByRole('button', { name: 'Confirmer le checkout' }))

      expect(onCheckout).toHaveBeenCalledWith(20)
    })
  })
})
