const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Clear existing data
  await prisma.transaction.deleteMany();
  await prisma.eventGuest.deleteMany();
  await prisma.eventOrganizer.deleteMany();
  await prisma.event.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.user.deleteMany();

  // Hash password for all users
  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // ============================================================================
  // USERS
  // ============================================================================

  // Create Superuser
  const superuser = await prisma.user.create({
    data: {
      utorid: 'admin001',
      name: 'Super Admin',
      email: 'admin@mail.utoronto.ca',
      password: hashedPassword,
      role: 'superuser',
      verified: true,
      points: 10000,
      birthday: new Date('1985-01-15'),
      suspicious: false,
    },
  });
  console.log('✓ Created superuser');

  // Create Managers
  const manager1 = await prisma.user.create({
    data: {
      utorid: 'manager1',
      name: 'Alice Manager',
      email: 'alice.manager@mail.utoronto.ca',
      password: hashedPassword,
      role: 'manager',
      verified: true,
      points: 5000,
      birthday: new Date('1990-03-20'),
      suspicious: false,
    },
  });

  const manager2 = await prisma.user.create({
    data: {
      utorid: 'manager2',
      name: 'Bob Manager',
      email: 'bob.manager@mail.utoronto.ca',
      password: hashedPassword,
      role: 'manager',
      verified: true,
      points: 4800,
      birthday: new Date('1989-07-10'),
      suspicious: false,
    },
  });
  console.log('✓ Created managers');

  // Create Cashiers (1 regular, 1 suspicious)
  const cashier1 = await prisma.user.create({
    data: {
      utorid: 'cashier1',
      name: 'Charlie Cashier',
      email: 'charlie.cashier@mail.utoronto.ca',
      password: hashedPassword,
      role: 'cashier',
      verified: true,
      points: 2000,
      birthday: new Date('1995-05-10'),
      suspicious: false,
    },
  });

  const cashier2 = await prisma.user.create({
    data: {
      utorid: 'cashier2',
      name: 'Diana Cashier',
      email: 'diana.cashier@mail.utoronto.ca',
      password: hashedPassword,
      role: 'cashier',
      verified: true,
      points: 1800,
      birthday: new Date('1996-09-18'),
      suspicious: true, // This cashier is marked suspicious
    },
  });
  console.log('✓ Created cashiers');

  // Create Regular Users
  const regularUsers = [];
  const userData = [
    { name: 'John Smith', verified: true, points: 2500 },
    { name: 'Jane Doe', verified: true, points: 3200 },
    { name: 'Mike Johnson', verified: true, points: 1800 },
    { name: 'Sarah Williams', verified: true, points: 4100 },
    { name: 'Tom Brown', verified: true, points: 950 },
    { name: 'Emma Davis', verified: true, points: 2700 },
    { name: 'Chris Wilson', verified: true, points: 3600 },
    { name: 'Lisa Martinez', verified: true, points: 1200 },
    { name: 'David Garcia', verified: false, points: 500 }, // Unverified
    { name: 'Anna Rodriguez', verified: false, points: 300 }, // Unverified
    { name: 'James Lee', verified: true, points: 4500 },
    { name: 'Emily Taylor', verified: true, points: 2100 },
    { name: 'Michael Anderson', verified: true, points: 3300 },
    { name: 'Sophia Thomas', verified: false, points: 150 }, // Unverified
    { name: 'William Jackson', verified: true, points: 2900 },
  ];

  for (let i = 0; i < userData.length; i++) {
    const user = await prisma.user.create({
      data: {
        utorid: `user${String(i + 1).padStart(4, '0')}`,
        name: userData[i].name,
        email: `${userData[i].name.toLowerCase().replace(' ', '.')}@mail.utoronto.ca`,
        password: hashedPassword,
        role: 'regular',
        verified: userData[i].verified,
        points: userData[i].points,
        birthday: new Date(`199${Math.floor(Math.random() * 9) + 1}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`),
        suspicious: false,
      },
    });
    regularUsers.push(user);
  }
  console.log('✓ Created 15 regular users');

  // ============================================================================
  // PROMOTIONS
  // ============================================================================

  const now = new Date();
  const promotions = [];

  // Active automatic promotions
  const autoPromo1 = await prisma.promotion.create({
    data: {
      name: 'Weekend Bonus',
      description: 'Get 50% extra points on all purchases during weekends',
      type: 'automatic',
      startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
      minSpending: 25,
      rate: 25 / 50, // 50% bonus
    },
  });
  promotions.push(autoPromo1);

  const autoPromo2 = await prisma.promotion.create({
    data: {
      name: 'Big Spender Reward',
      description: 'Spend $100+ and get 100% bonus points!',
      type: 'automatic',
      startTime: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      minSpending: 100,
      rate: 25 / 100, // 100% bonus
    },
  });
  promotions.push(autoPromo2);

  // Active one-time promotions
  const oneTimePromo1 = await prisma.promotion.create({
    data: {
      name: 'New Member Bonus',
      description: 'Welcome bonus for new members!',
      type: 'onetime',
      startTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      points: 100,
    },
  });
  promotions.push(oneTimePromo1);

  const oneTimePromo2 = await prisma.promotion.create({
    data: {
      name: 'Holiday Special',
      description: 'Holiday bonus points for everyone!',
      type: 'onetime',
      startTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
      minSpending: 50,
      points: 250,
    },
  });
  promotions.push(oneTimePromo2);

  const oneTimePromo3 = await prisma.promotion.create({
    data: {
      name: 'Flash Sale Bonus',
      description: 'Limited time 500 bonus points!',
      type: 'onetime',
      startTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      points: 500,
    },
  });
  promotions.push(oneTimePromo3);

  // Expired promotion
  await prisma.promotion.create({
    data: {
      name: 'Back to School Sale',
      description: 'This promotion has ended',
      type: 'automatic',
      startTime: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      minSpending: 30,
      rate: 25 / 75, // 75% bonus
    },
  });

  console.log('✓ Created 6 promotions (5 active, 1 expired)');

  // ============================================================================
  // EVENTS
  // ============================================================================

  const events = [];

  // Upcoming published events
  const event1 = await prisma.event.create({
    data: {
      name: 'React Workshop: Building Modern Web Apps',
      description: 'Learn the fundamentals of React and build your first single-page application. Covers components, state management, and hooks.',
      location: 'Bahen Centre BA2185',
      startTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      endTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 3 hours
      capacity: 50,
      pointsTotal: 2000,
      pointsAwarded: 0,
      published: true,
    },
  });
  events.push(event1);

  const event2 = await prisma.event.create({
    data: {
      name: 'Career Fair 2024',
      description: 'Meet with top tech companies and explore internship opportunities. Bring your resume!',
      location: 'Sidney Smith Hall, Main Floor',
      startTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      endTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000), // 5 hours
      capacity: 200,
      pointsTotal: 5000,
      pointsAwarded: 0,
      published: true,
    },
  });
  events.push(event2);

  const event3 = await prisma.event.create({
    data: {
      name: 'Machine Learning Study Group',
      description: 'Weekly study group for machine learning enthusiasts. All skill levels welcome!',
      location: 'Robarts Library 4th Floor',
      startTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      endTime: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 hours
      capacity: 30,
      pointsTotal: 1000,
      pointsAwarded: 0,
      published: true,
    },
  });
  events.push(event3);

  const event4 = await prisma.event.create({
    data: {
      name: 'Hackathon 2024: Build for Good',
      description: '24-hour hackathon focused on creating solutions for social impact. Prizes and food provided!',
      location: 'Myhal Centre',
      startTime: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000), // 20 days from now
      endTime: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), // 24 hours
      capacity: 100,
      pointsTotal: 10000,
      pointsAwarded: 0,
      published: true,
    },
  });
  events.push(event4);

  // Ongoing event
  const ongoingEvent = await prisma.event.create({
    data: {
      name: 'Tech Talk: The Future of AI',
      description: 'Guest speaker from OpenAI discussing the latest developments in artificial intelligence.',
      location: 'Convocation Hall',
      startTime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // Started 1 hour ago
      endTime: new Date(now.getTime() + 1 * 60 * 60 * 1000), // Ends in 1 hour
      capacity: 150,
      pointsTotal: 3000,
      pointsAwarded: 800,
      published: true,
    },
  });
  events.push(ongoingEvent);

  // Unpublished events (visible only to managers)
  const unpublishedEvent1 = await prisma.event.create({
    data: {
      name: 'VIP Networking Event',
      description: 'Exclusive networking event with industry leaders. Invitation only.',
      location: 'Hart House Great Hall',
      startTime: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
      capacity: 40,
      pointsTotal: 1500,
      pointsAwarded: 0,
      published: false,
    },
  });

  const unpublishedEvent2 = await prisma.event.create({
    data: {
      name: 'Planning Committee Meeting',
      description: 'Internal meeting for event planning committee members only.',
      location: 'Sidney Smith 2118',
      startTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 1 * 60 * 60 * 1000),
      capacity: 15,
      pointsTotal: 300,
      pointsAwarded: 0,
      published: false,
    },
  });

  // Past events
  const pastEvent1 = await prisma.event.create({
    data: {
      name: 'Orientation Week 2024',
      description: 'Welcome event for first-year students. Campus tour and introductions.',
      location: 'Front Campus',
      startTime: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
      capacity: 300,
      pointsTotal: 8000,
      pointsAwarded: 8000,
      published: true,
    },
  });

  const pastEvent2 = await prisma.event.create({
    data: {
      name: 'Python Basics Workshop',
      description: 'Introduction to Python programming for beginners.',
      location: 'Bahen Centre BA3200',
      startTime: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
      capacity: 40,
      pointsTotal: 1200,
      pointsAwarded: 1200,
      published: true,
    },
  });

  console.log('✓ Created 9 events (5 upcoming, 1 ongoing, 2 unpublished, 2 past)');

  // ============================================================================
  // EVENT ORGANIZERS
  // ============================================================================

  // Assign organizers to events
  await prisma.eventOrganizer.createMany({
    data: [
      { eventId: event1.id, userId: manager1.id },
      { eventId: event1.id, userId: regularUsers[0].id }, // John is also organizing
      { eventId: event2.id, userId: manager2.id },
      { eventId: event3.id, userId: manager1.id },
      { eventId: event3.id, userId: regularUsers[1].id }, // Jane is also organizing
      { eventId: event4.id, userId: manager2.id },
      { eventId: ongoingEvent.id, userId: manager1.id },
      { eventId: unpublishedEvent1.id, userId: manager2.id },
      { eventId: unpublishedEvent2.id, userId: manager1.id },
      { eventId: pastEvent1.id, userId: manager1.id },
      { eventId: pastEvent2.id, userId: manager2.id },
    ],
  });

  console.log('✓ Added event organizers');

  // ============================================================================
  // EVENT GUESTS
  // ============================================================================

  // Add guests to upcoming events
  await prisma.eventGuest.createMany({
    data: [
      // Event 1 (React Workshop) - 12 guests
      ...regularUsers.slice(0, 12).map(u => ({ eventId: event1.id, userId: u.id })),
      
      // Event 2 (Career Fair) - 25 guests
      ...regularUsers.slice(0, 15).map(u => ({ eventId: event2.id, userId: u.id })),
      { eventId: event2.id, userId: cashier1.id },
      { eventId: event2.id, userId: cashier2.id },
      
      // Event 3 (ML Study Group) - 8 guests
      ...regularUsers.slice(2, 10).map(u => ({ eventId: event3.id, userId: u.id })),
      
      // Event 4 (Hackathon) - 15 guests
      ...regularUsers.slice(0, 15).map(u => ({ eventId: event4.id, userId: u.id })),
      
      // Ongoing event - 20 guests
      ...regularUsers.slice(0, 15).map(u => ({ eventId: ongoingEvent.id, userId: u.id })),
      { eventId: ongoingEvent.id, userId: cashier1.id },
      
      // Past event 1 - 30 guests
      ...regularUsers.map(u => ({ eventId: pastEvent1.id, userId: u.id })),
      { eventId: pastEvent1.id, userId: cashier1.id },
      { eventId: pastEvent1.id, userId: cashier2.id },
      
      // Past event 2 - 10 guests
      ...regularUsers.slice(0, 10).map(u => ({ eventId: pastEvent2.id, userId: u.id })),
    ],
  });

  console.log('✓ Added event guests');

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  let transactionCount = 0;

  // Purchase transactions (30 purchases across different users)
  for (let i = 0; i < 30; i++) {
    const user = regularUsers[i % regularUsers.length];
    const cashier = i % 2 === 0 ? cashier1 : cashier2;
    const spent = Math.floor(Math.random() * 150) + 10;
    const basePoints = Math.floor(spent / 0.25); // 1 point per $0.25
    
    await prisma.transaction.create({
      data: {
        ownerUserId: user.id,
        creatorUserId: cashier.id,
        type: 'purchase',
        amount: basePoints,
        spent: spent,
        remark: `Purchase at store #${Math.floor(Math.random() * 5) + 1}`,
        suspicious: false,
      },
    });
    transactionCount++;
  }

  // Purchases with promotions applied (10 transactions)
  for (let i = 0; i < 10; i++) {
    const user = regularUsers[i];
    const spent = Math.floor(Math.random() * 100) + 50;
    const basePoints = Math.floor(spent / 0.25);
    const bonusPoints = Math.floor(spent / (25 / 50)); // 50% bonus
    
    // Create transaction and link to promotion
    await prisma.transaction.create({
      data: {
        ownerUserId: user.id,
        creatorUserId: cashier1.id,
        type: 'purchase',
        amount: basePoints + bonusPoints,
        spent: spent,
        remark: 'Purchase with Weekend Bonus promotion',
        suspicious: false,
        promotions: {
          connect: { id: autoPromo1.id }
        }
      },
    });
    transactionCount++;
  }

  // Adjustment transactions (both positive and negative)
  const adjustments = [
    { user: regularUsers[0], amount: 200, remark: 'Compensation for system error' },
    { user: regularUsers[1], amount: -150, remark: 'Correction for duplicate points' },
    { user: regularUsers[2], amount: 500, remark: 'Contest winner bonus' },
    { user: regularUsers[3], amount: -75, remark: 'Adjusted for returned purchase' },
    { user: regularUsers[4], amount: 100, remark: 'Customer satisfaction bonus' },
    { user: regularUsers[5], amount: -200, remark: 'Fraudulent transaction reversal' },
  ];

  for (const adj of adjustments) {
    const prevTransaction = await prisma.transaction.findFirst({
      where: { ownerUserId: adj.user.id },
      orderBy: { id: 'desc' },
    });

    await prisma.transaction.create({
      data: {
        ownerUserId: adj.user.id,
        creatorUserId: manager1.id,
        type: 'adjustment',
        amount: adj.amount,
        relatedTransactionId: prevTransaction ? prevTransaction.id : null,
        remark: adj.remark,
        suspicious: false,
      },
    });
    transactionCount++;
  }

  // Redemption transactions (15 total: 10 processed, 5 pending)
  for (let i = 0; i < 15; i++) {
    const user = regularUsers[i];
    const processed = i < 10;
    const amount = Math.floor(Math.random() * 800) + 200;
    
    await prisma.transaction.create({
      data: {
        ownerUserId: user.id,
        creatorUserId: user.id,
        processorUserId: processed ? cashier1.id : null,
        type: 'redemption',
        amount: -amount,
        redeemed: processed ? amount : null,
        remark: processed ? 'Redeemed for gift card' : 'Pending redemption',
        suspicious: false,
      },
    });
    transactionCount++;
  }

  // Transfer transactions (10 pairs = 20 transactions)
  for (let i = 0; i < 10; i++) {
    const sender = regularUsers[i];
    const receiver = regularUsers[(i + 5) % regularUsers.length];
    const amount = Math.floor(Math.random() * 300) + 50;

    // Sender transaction (negative)
    await prisma.transaction.create({
      data: {
        ownerUserId: sender.id,
        creatorUserId: sender.id,
        type: 'transfer',
        amount: -amount,
        relatedUserId: receiver.id,
        remark: `Transfer to ${receiver.utorid}`,
        suspicious: false,
      },
    });

    // Receiver transaction (positive)
    await prisma.transaction.create({
      data: {
        ownerUserId: receiver.id,
        creatorUserId: sender.id,
        type: 'transfer',
        amount: amount,
        relatedUserId: sender.id,
        remark: `Received from ${sender.utorid}`,
        suspicious: false,
      },
    });
    transactionCount += 2;
  }

  // Event transactions (points awarded at past events and ongoing event)
  const eventRewardData = [
    { event: pastEvent1, users: regularUsers.slice(0, 15), points: 200 },
    { event: pastEvent2, users: regularUsers.slice(0, 10), points: 120 },
    { event: ongoingEvent, users: regularUsers.slice(0, 8), points: 100 },
  ];

  for (const reward of eventRewardData) {
    for (const user of reward.users) {
      await prisma.transaction.create({
        data: {
          ownerUserId: user.id,
          creatorUserId: manager1.id,
          type: 'event',
          amount: reward.points,
          eventId: reward.event.id,
          remark: `Attendance reward for ${reward.event.name}`,
          suspicious: false,
        },
      });
      transactionCount++;
    }
  }

  console.log(`✓ Created ${transactionCount} transactions`);

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('\n' + '═'.repeat(70));
  console.log('✅ SEED COMPLETED SUCCESSFULLY!');
  console.log('═'.repeat(70));
  console.log('\n📊 Database Summary:');
  console.log('━'.repeat(70));
  console.log(`Users:        1 Superuser, 2 Managers, 2 Cashiers, 15 Regular`);
  console.log(`              (3 unverified users, 1 suspicious cashier)`);
  console.log(`Promotions:   6 total (5 active, 1 expired)`);
  console.log(`              - 2 automatic, 3 one-time, 1 expired`);
  console.log(`Events:       9 total (5 upcoming, 1 ongoing, 2 unpublished, 2 past)`);
  console.log(`Transactions: ${transactionCount} total`);
  console.log(`              - Purchases, transfers, redemptions, adjustments, events`);
  console.log('━'.repeat(70));
  console.log('\n🔑 Login Credentials (Password for all: Password123!):');
  console.log('━'.repeat(70));
  console.log('Superuser:  admin001');
  console.log('Managers:   manager1, manager2');
  console.log('Cashiers:   cashier1 (normal), cashier2 (suspicious)');
  console.log('Regular:    user0001, user0002, ..., user0015');
  console.log('            (user0009, user0010, user0014 are unverified)');
  console.log('━'.repeat(70));
  console.log('\n💡 Testing Tips:');
  console.log('━'.repeat(70));
  console.log('• Test user management with verified/unverified/suspicious users');
  console.log('• Test promotions with automatic vs one-time types');
  console.log('• Test events with upcoming, ongoing, past, and unpublished events');
  console.log('• Test transactions with various types and states');
  console.log('• Test transfers between user0001-user0010');
  console.log('• Test redemptions with pending and processed states');
  console.log('━'.repeat(70));
  console.log('\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });